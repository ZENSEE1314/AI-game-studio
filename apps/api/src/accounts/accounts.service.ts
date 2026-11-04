import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { toCsv } from '../common/csv';
import { AuthUser } from '../common/decorators';
import { randomBytes } from 'crypto';
import { creatableRoles, deriveChain, isValidParent, validateRoleChange } from '../common/hierarchy';

export interface CreateAccountInput {
  role: Role; parentId?: string; username: string; email: string; password: string;
  fullName: string; phone?: string;
}

// No 0/O/1/I/L: codes are read aloud and typed by hand.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newReferralCode = () => Array.from(randomBytes(8), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

const PUBLIC_SELECT = {
  id: true, username: true, email: true, phone: true, fullName: true, role: true, parentId: true,
  agencyId: true, agentId: true, staffId: true, status: true, suspendedAt: true,
  suspensionReason: true, lastLogin: true, createdAt: true, updatedAt: true, referralCode: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** Ids the actor may see/manage. SUPER_ADMIN: everyone. Others: strict descendants only. */
  private scopeWhere(actor: AuthUser): Prisma.UserWhereInput {
    if (actor.role === Role.SUPER_ADMIN) return {};
    return { descendantOf: { some: { ancestorId: actor.id, depth: { gt: 0 } } } };
  }

  async assertInScope(actor: AuthUser, targetId: string) {
    const t = await this.prisma.user.findFirst({ where: { id: targetId, ...this.scopeWhere(actor) }, select: PUBLIC_SELECT });
    // Same error for "missing" and "out of scope": no existence leak across hierarchies.
    if (!t) throw new NotFoundException('Account not found');
    return t;
  }

  create(actor: AuthUser, dto: CreateAccountInput, ip?: string) {
    return this.createInternal(actor, dto, ip, 'ACCOUNT_CREATED');
  }

  async createInternal(actor: AuthUser, dto: CreateAccountInput, ip: string | undefined, auditAction: string) {
    if (!creatableRoles(actor.role).includes(dto.role)) throw new ForbiddenException(`${actor.role} cannot create ${dto.role}`);

    let parentId = dto.parentId;
    if (!parentId) {
      if (actor.role === Role.SUPER_ADMIN && dto.role !== Role.AGENCY) throw new BadRequestException('parentId is required');
      parentId = actor.id;
    }
    const parent = await this.prisma.user.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Parent not found');
    if (!isValidParent(dto.role, parent.role)) throw new BadRequestException(`A ${dto.role} must belong to a ${parent.role === Role.SUPER_ADMIN ? 'SUPER_ADMIN' : 'valid parent'} of the correct level`);
    if (parent.id !== actor.id) await this.assertInScope(actor, parent.id);

    const blocked = await this.prisma.accountHierarchy.count({ where: { descendantId: parent.id, ancestor: { status: 'SUSPENDED' } } });
    if (blocked > 0) throw new ConflictException('Parent account is suspended');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const chain = deriveChain(parent);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            username: dto.username, email: dto.email.toLowerCase(), phone: dto.phone, fullName: dto.fullName,
            passwordHash, role: dto.role, parentId: parent.id, ...chain,
            ...(dto.role === Role.STAFF ? { referralCode: newReferralCode() } : {}),
          },
          select: PUBLIC_SELECT,
        });
        // Closure rows: self + a row per ancestor of the parent (and the parent itself).
        const ancestors = await tx.accountHierarchy.findMany({ where: { descendantId: parent.id } });
        await tx.accountHierarchy.createMany({
          data: [
            { ancestorId: user.id, descendantId: user.id, depth: 0 },
            ...ancestors.map((a) => ({ ancestorId: a.ancestorId, descendantId: user.id, depth: a.depth + 1 })),
          ],
        });
        await this.audit.log({
          actorId: actor.id, action: auditAction, entityType: 'user', entityId: user.id,
          metadata: { role: dto.role, parentId: parent.id }, ip,
        }, tx);
        return user;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Username, email or phone already in use');
      }
      throw e;
    }
  }

  async list(actor: AuthUser, q: { role?: Role; status?: 'ACTIVE' | 'SUSPENDED'; search?: string; parentId?: string; page: number; limit: number }) {
    const where: Prisma.UserWhereInput = {
      AND: [
        this.scopeWhere(actor),
        { role: q.role, status: q.status, parentId: q.parentId },
        q.search ? { OR: [
          { username: { contains: q.search, mode: 'insensitive' } },
          { email: { contains: q.search, mode: 'insensitive' } },
          { fullName: { contains: q.search, mode: 'insensitive' } },
        ] } : {},
      ],
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: PUBLIC_SELECT, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }

  /** Same scoping and filters as list(); capped to protect the server. */
  async exportCsv(actor: AuthUser, q: { role?: Role; status?: 'ACTIVE' | 'SUSPENDED'; search?: string; parentId?: string }) {
    const { items } = await this.list(actor, { ...q, page: 1, limit: 5000 });
    const iso = (d: Date | null) => (d ? d.toISOString() : '');
    return toCsv([
      ['Username', 'Full name', 'Email', 'Phone', 'Role', 'Status', 'Suspension reason', 'Last login', 'Created'],
      ...items.map((u) => [u.username, u.fullName, u.email, u.phone, u.role, u.status, u.suspensionReason, iso(u.lastLogin), iso(u.createdAt)]),
    ]);
  }

  get(actor: AuthUser, id: string) {
    return this.assertInScope(actor, id);
  }

  async history(actor: AuthUser, id: string) {
    await this.assertInScope(actor, id);
    return this.prisma.accountStatusHistory.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Admin: change an account's level and/or move it under another parent. Only accounts with nobody below them;
   * the closure table, denormalised ancestors and referral code are rewritten in one transaction and sessions revoked.
   */
  async changeRole(actor: AuthUser, id: string, d: { role: Role; parentId: string }, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(727003)`; // hierarchy edits one at a time
      const t = await tx.user.findUnique({ where: { id } });
      if (!t) throw new NotFoundException('Account not found');
      const parent = await tx.user.findUnique({ where: { id: d.parentId } });
      if (!parent) throw new NotFoundException('Parent not found');
      const kids = await tx.accountHierarchy.count({ where: { ancestorId: id, depth: { gt: 0 } } });
      const err = validateRoleChange({ id: t.id, role: t.role }, d.role, parent ? { id: parent.id, role: parent.role } : null, kids);
      if (err) throw new BadRequestException(err);
      if (!parent) throw new NotFoundException('Parent not found');
      // The new parent must not itself sit below the account being moved (cannot happen for leaves, kept as a guard).
      const loop = await tx.accountHierarchy.count({ where: { ancestorId: id, descendantId: parent.id } });
      if (loop) throw new BadRequestException('The new parent is below this account');
      const blocked = await tx.accountHierarchy.count({ where: { descendantId: parent.id, ancestor: { status: 'SUSPENDED' } } });
      if (blocked > 0) throw new ConflictException('The new parent is suspended');

      const chain = deriveChain(parent);
      let referralCode: string | null = d.role === Role.STAFF ? (t.role === Role.STAFF ? t.referralCode : newReferralCode()) : null;
      const updated = await tx.user.update({
        where: { id }, data: { role: d.role, parentId: parent.id, ...chain, referralCode },
        select: PUBLIC_SELECT,
      });
      await tx.accountHierarchy.deleteMany({ where: { descendantId: id, ancestorId: { not: id } } });
      const ancestors = await tx.accountHierarchy.findMany({ where: { descendantId: parent.id } });
      await tx.accountHierarchy.createMany({ data: ancestors.map((a) => ({ ancestorId: a.ancestorId, descendantId: id, depth: a.depth + 1 })) });
      // Permissions changed: end every session of this account.
      const revoked = await tx.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'ROLE_CHANGED' } });
      await this.audit.log({
        actorId: actor.id, action: 'ACCOUNT_ROLE_CHANGED', entityType: 'user', entityId: id,
        metadata: { fromRole: t.role, toRole: d.role, fromParent: t.parentId, toParent: parent.id, sessionsRevoked: revoked.count }, ip,
      }, tx);
      return updated;
    });
  }

  // ---------- suspension ----------

  /** Confirmation screen data: how many accounts lose access. */
  async suspensionPreview(actor: AuthUser, id: string) {
    const target = await this.assertInScope(actor, id);
    const desc = await this.prisma.user.groupBy({
      by: ['role'], _count: { _all: true },
      where: { descendantOf: { some: { ancestorId: id, depth: { gt: 0 } } } },
    });
    const byRole = Object.fromEntries(desc.map((d) => [d.role, d._count._all]));
    const affectedAccounts = desc.reduce((n, d) => n + d._count._all, 0);
    return { target, affectedAccounts, byRole, totalIncludingTarget: affectedAccounts + 1 };
  }

  async suspend(actor: AuthUser, id: string, reason: string, ip?: string) {
    const target = await this.assertInScope(actor, id);
    if (target.role === Role.SUPER_ADMIN || id === actor.id) throw new ForbiddenException('This account cannot be suspended');
    if (target.status === 'SUSPENDED') throw new ConflictException('Already suspended');
    return this.prisma.$transaction(async (tx) => {
      const affected = await tx.accountHierarchy.count({ where: { ancestorId: id, depth: { gt: 0 } } });
      const updated = await tx.user.update({
        where: { id }, data: { status: 'SUSPENDED', suspendedAt: new Date(), suspensionReason: reason, suspendedById: actor.id },
        select: PUBLIC_SELECT,
      });
      // Immediate session revocation for the account and the whole subtree.
      const revoked = await tx.userSession.updateMany({
        where: { revokedAt: null, user: { descendantOf: { some: { ancestorId: id } } } },
        data: { revokedAt: new Date(), revokeReason: 'ACCOUNT_SUSPENDED' },
      });
      await tx.accountStatusHistory.create({
        data: { userId: id, fromStatus: 'ACTIVE', toStatus: 'SUSPENDED', reason, changedById: actor.id, affectedCount: affected },
      });
      await this.audit.log({
        actorId: actor.id, action: 'ACCOUNT_SUSPENDED', entityType: 'user', entityId: id,
        metadata: { reason, affectedDescendants: affected, sessionsRevoked: revoked.count }, ip,
      }, tx);
      return { account: updated, affectedDescendants: affected, sessionsRevoked: revoked.count };
    });
  }

  async reactivate(actor: AuthUser, id: string, reason: string, ip?: string) {
    const target = await this.assertInScope(actor, id);
    if (target.status !== 'SUSPENDED') throw new ConflictException('Account is not suspended');
    // A child may never regain access while any ancestor stays suspended.
    const blocker = await this.prisma.accountHierarchy.findFirst({
      where: { descendantId: id, depth: { gt: 0 }, ancestor: { status: 'SUSPENDED' } },
      include: { ancestor: { select: { id: true, username: true, role: true } } },
    });
    if (blocker) {
      throw new ConflictException({
        code: 'ANCESTOR_SUSPENDED',
        message: `Cannot reactivate: ancestor ${blocker.ancestor.role} "${blocker.ancestor.username}" is still suspended`,
        ancestorId: blocker.ancestor.id,
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id }, data: { status: 'ACTIVE', suspendedAt: null, suspensionReason: null, suspendedById: null },
        select: PUBLIC_SELECT,
      });
      await tx.accountStatusHistory.create({
        data: { userId: id, fromStatus: 'SUSPENDED', toStatus: 'ACTIVE', reason, changedById: actor.id, affectedCount: 0 },
      });
      await this.audit.log({ actorId: actor.id, action: 'ACCOUNT_REACTIVATED', entityType: 'user', entityId: id, metadata: { reason }, ip }, tx);
      return updated;
    });
  }
}
