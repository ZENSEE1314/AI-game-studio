import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

export function computeAuditHash(prev: string | null, e: AuditEntry, at: string): string {
  return createHash('sha256')
    .update(JSON.stringify([prev, e.actorId ?? null, e.action, e.entityType, e.entityId ?? null, e.metadata ?? null, at]))
    .digest('hex');
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Append a hash-chained entry. Pass `tx` to commit atomically with the change being audited. */
  async log(e: AuditEntry, tx?: Prisma.TransactionClient) {
    const run = async (c: Prisma.TransactionClient) => {
      await c.$executeRaw`SELECT pg_advisory_xact_lock(727001)`; // serialise chain writers
      const last = await c.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
      const at = new Date();
      const hash = computeAuditHash(last?.hash ?? null, e, at.toISOString());
      return c.auditLog.create({
        data: {
          actorId: e.actorId ?? null, action: e.action, entityType: e.entityType,
          entityId: e.entityId ?? null, metadata: e.metadata ?? undefined, ip: e.ip ?? null,
          prevHash: last?.hash ?? null, hash, createdAt: at,
        },
      });
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  async list(p: { page: number; limit: number; action?: string; actorId?: string; entityType?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      action: p.action, actorId: p.actorId, entityType: p.entityType,
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where, orderBy: { id: 'desc' }, skip: (p.page - 1) * p.limit, take: p.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items: items.map((i) => ({ ...i, id: i.id.toString() })), total, page: p.page, limit: p.limit };
  }
}
