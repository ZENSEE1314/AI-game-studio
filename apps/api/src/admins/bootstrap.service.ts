import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * First-run setup without a terminal: if there is NO Super Admin yet and BOOTSTRAP_ADMIN_* variables are set,
 * create one. It never runs when any Super Admin exists (so leaving the variables set is harmless, though
 * they should be deleted afterwards). The password is treated as temporary: the admin must change it at first sign-in.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private log = new Logger('Bootstrap');
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async onApplicationBootstrap() { await this.run(process.env); }

  async run(env: NodeJS.ProcessEnv) {
    const username = env.BOOTSTRAP_ADMIN_USERNAME, email = env.BOOTSTRAP_ADMIN_EMAIL, password = env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!username && !email && !password) return 'skipped';
    if (!username || !email || !password) { this.log.warn('BOOTSTRAP_ADMIN_USERNAME, _EMAIL and _PASSWORD must all be set; skipping'); return 'incomplete'; }
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username) || password.length < 12) { this.log.warn('Bootstrap admin rejected: username must be 3-32 letters/digits/._- and password at least 12 characters'); return 'invalid'; }
    if (await this.prisma.user.count({ where: { role: Role.SUPER_ADMIN } })) return 'exists';
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(727002)`;
        if (await tx.user.count({ where: { role: Role.SUPER_ADMIN } })) return; // another instance won the race
        const u = await tx.user.create({ data: { username, email: email.toLowerCase(), fullName: 'Super Admin', passwordHash, role: Role.SUPER_ADMIN, mustChangePassword: true } });
        await tx.accountHierarchy.create({ data: { ancestorId: u.id, descendantId: u.id, depth: 0 } });
        await this.audit.log({ actorId: u.id, action: 'ADMIN_BOOTSTRAPPED', entityType: 'user', entityId: u.id, metadata: { username } }, tx);
      });
      this.log.log(`Created first Super Admin "${username}". Sign in, change the password, then delete the BOOTSTRAP_ADMIN_* variables.`);
      return 'created';
    } catch (e: any) { this.log.error(`Bootstrap failed: ${e.message}`); return 'failed'; }
  }
}
