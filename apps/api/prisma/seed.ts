import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from '../src/common/permissions';
import { ROLE_RANK } from '../src/common/hierarchy';

const prisma = new PrismaClient();

async function main() {
  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
  }
  for (const role of Object.values(Role)) {
    const r = await prisma.roleDef.upsert({ where: { name: role }, create: { name: role, rank: ROLE_RANK[role] }, update: { rank: ROLE_RANK[role] } });
    await prisma.rolePermission.deleteMany({ where: { roleId: r.id } });
    for (const code of ROLE_PERMISSIONS[role]) {
      const p = await prisma.permission.findUniqueOrThrow({ where: { code } });
      await prisma.rolePermission.create({ data: { roleId: r.id, permissionId: p.id } });
    }
  }
  const username = process.env.SEED_ADMIN_USERNAME ?? 'superadmin';
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) throw new Error('Set SEED_ADMIN_PASSWORD (>=12 chars) to create the first Super Admin');
  const exists = await prisma.user.findUnique({ where: { username } });
  if (!exists) {
    const u = await prisma.user.create({
      data: {
        username, email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com', fullName: 'Super Admin',
        role: Role.SUPER_ADMIN, passwordHash: await bcrypt.hash(password, 12),
      },
    });
    await prisma.accountHierarchy.create({ data: { ancestorId: u.id, descendantId: u.id, depth: 0 } });
    console.log(`Created Super Admin "${username}" - enable 2FA on first login.`);
  }
}
main().finally(() => prisma.$disconnect());
