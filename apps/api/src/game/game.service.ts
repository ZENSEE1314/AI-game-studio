import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, RoundStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { NotificationsService } from '../notifications/notifications.module';
import { Pick, totalStake, validatePicks } from './game.math';

type Tx = Prisma.TransactionClient;
const big = (n: number) => BigInt(n);

@Injectable()
export class GameService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notices: NotificationsService) {}

  // ---------- wallet (in-game credits: no cash value, no purchase/withdraw/transfer path exists) ----------
  private async ensureWallet(tx: Tx, userId: string) {
    return tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  async myWallet(userId: string) {
    const w = await this.prisma.$transaction((tx) => this.ensureWallet(tx, userId));
    return { available: w.balance, held: w.held, total: w.balance + w.held };
  }

  async myLedger(userId: string, page: number, limit: number) {
    const w = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!w) return { items: [], total: 0, page, limit };
    const [items, total] = await Promise.all([
      this.prisma.walletLedger.findMany({ where: { walletId: w.id }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.walletLedger.count({ where: { walletId: w.id } }),
    ]);
    return { items, total, page, limit };
  }

  async grant(actor: AuthUser, d: { userId: string; amount: number; idempotencyKey?: string; note?: string }, ip?: string) {
    const target = await this.prisma.user.findUnique({ where: { id: d.userId }, select: { id: true, role: true, username: true } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === Role.SUPER_ADMIN) throw new BadRequestException('Super Admin accounts do not hold credits');
    if (d.idempotencyKey) {
      const dup = await this.prisma.walletLedger.findUnique({ where: { idempotencyKey: d.idempotencyKey } });
      if (dup) return { duplicate: true, ledgerId: dup.id, balanceAfter: dup.balanceAfter };
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const w = await this.ensureWallet(tx, d.userId);
        const [row] = await tx.$queryRaw<{ balance: bigint; held: bigint }[]>`
          UPDATE wallets SET balance = balance + ${big(d.amount)}, updated_at = now() WHERE id = ${w.id}::uuid RETURNING balance, held`;
        const l = await tx.walletLedger.create({ data: {
          walletId: w.id, kind: 'GRANT', amount: big(d.amount), balanceAfter: row.balance, heldAfter: row.held,
          ref: d.note ?? 'admin grant', idempotencyKey: d.idempotencyKey, createdById: actor.id,
        } });
        await this.audit.log({ actorId: actor.id, action: 'CREDITS_GRANTED', entityType: 'wallet', entityId: w.id, metadata: { userId: d.userId, amount: d.amount, note: d.note ?? null }, ip }, tx);
        return { duplicate: false, ledgerId: l.id, balanceAfter: row.balance };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const dup = await this.prisma.walletLedger.findUnique({ where: { idempotencyKey: d.idempotencyKey! } });
        if (dup) return { duplicate: true, ledgerId: dup.id, balanceAfter: dup.balanceAfter };
      }
      throw e;
    }
  }

  async balances(search: string | undefined, page: number, limit: number) {
    const where: Prisma.UserWhereInput = { role: { not: 'SUPER_ADMIN' }, ...(search ? { OR: [{ username: { contains: search, mode: 'insensitive' } }, { fullName: { contains: search, mode: 'insensitive' } }] } : {}) };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: { id: true, username: true, fullName: true, role: true }, orderBy: { username: 'asc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.user.count({ where }),
    ]);
    const wallets = await this.prisma.wallet.findMany({ where: { userId: { in: users.map((u) => u.id) } } });
    const byUser = new Map(wallets.map((w) => [w.userId, w]));
    return { items: users.map((u) => ({ ...u, available: byUser.get(u.id)?.balance ?? 0n, held: byUser.get(u.id)?.held ?? 0n })), total, page, limit };
  }

  // ---------- internal money-movement helpers (hold / release only) ----------
  private async hold(tx: Tx, userId: string, amount: bigint, ref: string, by: string) {
    if (amount <= 0n) return;
    const rows = await tx.$queryRaw<{ id: string; balance: bigint; held: bigint }[]>`
      UPDATE wallets SET balance = balance - ${amount}, held = held + ${amount}, updated_at = now()
      WHERE user_id = ${userId}::uuid AND balance >= ${amount} RETURNING id, balance, held`;
    if (!rows.length) throw new ConflictException('Not enough credits available');
    await tx.walletLedger.create({ data: { walletId: rows[0].id, kind: 'HOLD', amount, balanceAfter: rows[0].balance, heldAfter: rows[0].held, ref, createdById: by } });
  }

  private async release(tx: Tx, userId: string, amount: bigint, ref: string, by: string) {
    if (amount <= 0n) return;
    const rows = await tx.$queryRaw<{ id: string; balance: bigint; held: bigint }[]>`
      UPDATE wallets SET balance = balance + ${amount}, held = held - ${amount}, updated_at = now()
      WHERE user_id = ${userId}::uuid AND held >= ${amount} RETURNING id, balance, held`;
    if (!rows.length) throw new ConflictException('Ledger inconsistency: held credits are lower than expected');
    await tx.walletLedger.create({ data: { walletId: rows[0].id, kind: 'RELEASE', amount, balanceAfter: rows[0].balance, heldAfter: rows[0].held, ref, createdById: by } });
  }

  /** Releases every unreleased hold of a round (used on publish and cancel). */
  private async releaseRound(tx: Tx, roundId: string, by: string, why: string) {
    const groups = await tx.numberSelection.groupBy({ by: ['userId'], where: { roundId, released: false }, _sum: { stake: true } });
    for (const g of groups) await this.release(tx, g.userId, g._sum.stake ?? 0n, `round:${roundId}:${why}`, by);
    await tx.numberSelection.updateMany({ where: { roundId, released: false }, data: { released: true } });
    return groups.length;
  }

  // ---------- rounds (admin) ----------
  async createRound(actor: AuthUser, d: { name: string; minStake?: number }) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.gameRound.create({ data: { name: d.name, minStake: big(d.minStake ?? 10000), createdById: actor.id } });
      await this.audit.log({ actorId: actor.id, action: 'ROUND_CREATED', entityType: 'game_round', entityId: r.id, metadata: { name: d.name } }, tx);
      return r;
    });
  }

  private async move(actor: AuthUser, id: string, from: RoundStatus[], to: RoundStatus, extra: Prisma.GameRoundUncheckedUpdateManyInput = {}, after?: (tx: Tx) => Promise<unknown>) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.gameRound.updateMany({ where: { id, status: { in: from } }, data: { status: to, ...extra } });
      if (!r.count) {
        const cur = await tx.gameRound.findUnique({ where: { id }, select: { status: true } });
        if (!cur) throw new NotFoundException('Round not found');
        throw new ConflictException(`Round is ${cur.status}; cannot move to ${to}`);
      }
      const extraInfo = after ? await after(tx) : undefined;
      await this.audit.log({ actorId: actor.id, action: `ROUND_${to}`, entityType: 'game_round', entityId: id, metadata: extraInfo ? { info: extraInfo as any } : undefined }, tx);
      return tx.gameRound.findUniqueOrThrow({ where: { id } });
    });
  }

  open(a: AuthUser, id: string) {
    return this.move(a, id, ['DRAFT'], 'OPEN', { openedAt: new Date() }, async (tx) => {
      const r = await tx.gameRound.findUniqueOrThrow({ where: { id } });
      const n = await this.notices.notify(await this.notices.playerIds(tx), {
        type: 'ROUND_OPENED', title: 'New round open', body: `${r.name} is open. Pick your numbers (minimum ${r.minStake.toString()} credits each).`, data: { roundId: id },
      }, tx);
      return { notified: n };
    });
  }

  async lock(a: AuthUser, id: string) {
    // FOR SHARE locks taken by players' submissions block this update until they finish: no pick slips in after lock.
    return this.move(a, id, ['OPEN'], 'LOCKED', { lockedAt: new Date() });
  }

  cancel(a: AuthUser, id: string) {
    return this.move(a, id, ['DRAFT', 'OPEN', 'LOCKED', 'RESULT_PENDING'], 'CANCELLED', {}, async (tx) => {
      const r = await tx.gameRound.findUniqueOrThrow({ where: { id } });
      const who = (await tx.numberSelection.findMany({ where: { roundId: id }, select: { userId: true }, distinct: ['userId'] })).map((x) => x.userId);
      const players = await this.releaseRound(tx, id, a.id, 'cancelled');
      await this.notices.notify(who, { type: 'ROUND_CANCELLED', title: 'Round cancelled', body: `${r.name} was cancelled. Your held credits were returned.`, data: { roundId: id } }, tx);
      return { players };
    });
  }

  async setResult(a: AuthUser, id: string, number: number) {
    if (!Number.isInteger(number) || number < 1 || number > 27) throw new BadRequestException('Result must be a whole number from 1 to 27');
    return this.move(a, id, ['LOCKED', 'RESULT_PENDING'], 'RESULT_PENDING', { pendingNumber: number });
  }

  async publish(a: AuthUser, id: string) {
    const r = await this.prisma.gameRound.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Round not found');
    if (r.status !== 'RESULT_PENDING' || r.pendingNumber === null) throw new ConflictException('Enter the result first; only a pending result can be published');
    const number = r.pendingNumber;
    return this.prisma.$transaction(async (tx) => {
      const flip = await tx.gameRound.updateMany({ where: { id, status: 'RESULT_PENDING' }, data: { status: 'RESULT_PENDING' } }); // serialise concurrent publishes
      if (!flip.count) throw new ConflictException('Round changed, retry');
      await tx.roundResult.create({ data: { roundId: id, number, publishedBy: a.id } });
      await tx.gameRound.update({ where: { id }, data: { status: 'COMPLETED' } });
      const players = await this.releaseRound(tx, id, a.id, 'completed');
      const winners = await tx.numberSelection.count({ where: { roundId: id, number } });
      const sel = await tx.numberSelection.findMany({ where: { roundId: id }, select: { userId: true, number: true } });
      const winIds = new Set(sel.filter((x) => x.number === number).map((x) => x.userId));
      const all = [...new Set(sel.map((x) => x.userId))];
      await this.notices.notify(all.filter((u) => winIds.has(u)), { type: 'ROUND_RESULT', title: 'You won! 🏆', body: `${r.name}: the winning number was ${number} and you picked it.`, data: { roundId: id, won: true, number } }, tx);
      await this.notices.notify(all.filter((u) => !winIds.has(u)), { type: 'ROUND_RESULT', title: 'Result published', body: `${r.name}: the winning number was ${number}. Your credits were returned.`, data: { roundId: id, won: false, number } }, tx);
      await this.audit.log({ actorId: a.id, action: 'ROUND_RESULT_PUBLISHED', entityType: 'game_round', entityId: id, metadata: { number, players, winners } }, tx);
      return tx.gameRound.findUniqueOrThrow({ where: { id }, include: { result: true } });
    });
  }

  // ---------- players ----------
  async setSelections(user: AuthUser, roundId: string, picks: Pick[]) {
    const round0 = await this.prisma.gameRound.findUnique({ where: { id: roundId } });
    if (!round0 || round0.status === 'DRAFT') throw new NotFoundException('Round not found');
    let clean: Pick[];
    try { clean = validatePicks(picks, Number(round0.minStake)); } catch (e: any) { throw new BadRequestException(e.message); }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM wallets WHERE user_id = ${user.id}::uuid FOR UPDATE`; // serialise this player's own submissions
      await this.ensureWallet(tx, user.id);
      const [{ status }] = await tx.$queryRaw<{ status: RoundStatus }[]>`SELECT status FROM game_rounds WHERE id = ${roundId}::uuid FOR SHARE`;
      if (status !== 'OPEN') throw new ConflictException(`Round is ${status}; picks can no longer be changed`);
      const old = await tx.numberSelection.aggregate({ where: { roundId, userId: user.id, released: false }, _sum: { stake: true } });
      await this.release(tx, user.id, old._sum.stake ?? 0n, `round:${roundId}:edit`, user.id);
      await tx.numberSelection.deleteMany({ where: { roundId, userId: user.id } });
      const total = big(totalStake(clean));
      await this.hold(tx, user.id, total, `round:${roundId}:picks`, user.id);
      if (clean.length) await tx.numberSelection.createMany({ data: clean.map((p) => ({ roundId, userId: user.id, number: p.number, stake: big(p.stake) })) });
      return { picks: clean, held: total };
    });
  }

  listRounds(user: AuthUser) {
    const admin = user.role === 'SUPER_ADMIN';
    return this.prisma.gameRound.findMany({
      where: admin ? {} : { status: { not: 'DRAFT' } }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { result: true, _count: { select: { selections: true } } },
    }).then((rs) => rs.map((r) => ({ ...r, pendingNumber: admin || r.status === 'COMPLETED' ? r.pendingNumber : null })));
  }

  async getRound(user: AuthUser, id: string) {
    const admin = user.role === 'SUPER_ADMIN';
    const r = await this.prisma.gameRound.findUnique({ where: { id }, include: { result: true } });
    if (!r || (!admin && r.status === 'DRAFT')) throw new NotFoundException('Round not found');
    const mine = admin ? [] : await this.prisma.numberSelection.findMany({ where: { roundId: id, userId: user.id }, orderBy: { number: 'asc' } });
    const res: any = { ...r, pendingNumber: admin || r.status === 'COMPLETED' ? r.pendingNumber : null, mine };
    if (admin) {
      const byNumber = await this.prisma.numberSelection.groupBy({ by: ['number'], where: { roundId: id }, _count: { _all: true }, _sum: { stake: true }, orderBy: { number: 'asc' } });
      res.byNumber = byNumber.map((b) => ({ number: b.number, players: b._count._all, stake: b._sum.stake }));
      if (r.pendingNumber) res.previewWinners = await this.winnersFor(id, r.pendingNumber);
    }
    if (r.result) res.winners = await this.winnersFor(id, r.result.number);
    return res;
  }

  private async winnersFor(roundId: string, number: number) {
    const sel = await this.prisma.numberSelection.findMany({ where: { roundId, number }, orderBy: { stake: 'desc' } });
    const users = await this.prisma.user.findMany({ where: { id: { in: sel.map((s) => s.userId) } }, select: { id: true, username: true, fullName: true } });
    const m = new Map(users.map((u) => [u.id, u]));
    return sel.map((s) => ({ userId: s.userId, username: m.get(s.userId)?.username, fullName: m.get(s.userId)?.fullName, stake: s.stake }));
  }

  /** Wins per player across completed rounds. */
  async leaderboard(limit: number) {
    const rows = await this.prisma.$queryRaw<{ user_id: string; wins: bigint; credits_on_wins: bigint }[]>`
      SELECT s.user_id, COUNT(DISTINCT s.round_id) AS wins, SUM(s.stake) AS credits_on_wins
      FROM number_selections s JOIN round_results r ON r.round_id = s.round_id AND r.number = s.number
      GROUP BY s.user_id ORDER BY wins DESC, credits_on_wins DESC LIMIT ${limit}`;
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.user_id) } }, select: { id: true, username: true, fullName: true } });
    const m = new Map(users.map((u) => [u.id, u]));
    return rows.map((r, i) => ({ rank: i + 1, userId: r.user_id, username: m.get(r.user_id)?.username, fullName: m.get(r.user_id)?.fullName, wins: Number(r.wins), creditsOnWins: r.credits_on_wins }));
  }

  async myHistory(user: AuthUser) {
    const sel = await this.prisma.numberSelection.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 200 });
    const rounds = await this.prisma.gameRound.findMany({ where: { id: { in: [...new Set(sel.map((s) => s.roundId))] } }, include: { result: true } });
    const m = new Map(rounds.map((r) => [r.id, r]));
    return sel.map((s) => { const r = m.get(s.roundId)!; return { roundId: s.roundId, round: r.name, status: r.status, number: s.number, stake: s.stake, resultNumber: r.result?.number ?? null, won: r.result ? r.result.number === s.number : null }; });
  }
}
