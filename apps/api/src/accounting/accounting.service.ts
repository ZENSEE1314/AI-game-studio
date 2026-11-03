import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountClass, JournalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { toCsv } from '../common/csv';
import { Activity, BalanceRow, LineInput, balanceSheet, cashFlow, cleanLines, incomeStatement, reconciliationSummary, trialBalance } from './accounting.math';

const ALLOW_SELF_APPROVAL = () => process.env.ACCOUNTING_ALLOW_SELF_APPROVAL === 'true';
const day = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) throw new BadRequestException('Dates must be YYYY-MM-DD');
  return new Date(`${s}T00:00:00.000Z`);
};

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ---------- chart of accounts ----------
  listAccounts() { return this.prisma.chartAccount.findMany({ orderBy: { code: 'asc' } }); }

  async createAccount(actor: AuthUser, d: { code: string; name: string; class: AccountClass }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const a = await tx.chartAccount.create({ data: d });
        await this.audit.log({ actorId: actor.id, action: 'COA_ACCOUNT_CREATED', entityType: 'chart_account', entityId: a.id, metadata: d }, tx);
        return a;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Account code already exists');
      throw e;
    }
  }

  async setAccountActive(actor: AuthUser, id: string, isActive: boolean) {
    const a = await this.prisma.chartAccount.findUnique({ where: { id } });
    if (!a) throw new NotFoundException();
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.chartAccount.update({ where: { id }, data: { isActive } });
      await this.audit.log({ actorId: actor.id, action: 'COA_ACCOUNT_ACTIVE_CHANGED', entityType: 'chart_account', entityId: id, metadata: { isActive } }, tx);
      return u;
    });
  }

  // ---------- periods ----------
  listPeriods() { return this.prisma.accountingPeriod.findMany({ orderBy: { startDate: 'desc' } }); }

  async createPeriod(actor: AuthUser, d: { name: string; startDate: string; endDate: string }) {
    const startDate = day(d.startDate), endDate = day(d.endDate);
    if (startDate > endDate) throw new BadRequestException('startDate must not be after endDate');
    const overlap = await this.prisma.accountingPeriod.findFirst({ where: { startDate: { lte: endDate }, endDate: { gte: startDate } } });
    if (overlap) throw new ConflictException(`Overlaps period "${overlap.name}"`);
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.accountingPeriod.create({ data: { name: d.name, startDate, endDate } });
      await this.audit.log({ actorId: actor.id, action: 'PERIOD_CREATED', entityType: 'accounting_period', entityId: p.id, metadata: d }, tx);
      return p;
    });
  }

  async closePeriod(actor: AuthUser, id: string) {
    const pending = await this.prisma.journalEntry.count({ where: { periodId: id, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] } } });
    if (pending) throw new ConflictException(`${pending} unposted journal entr${pending === 1 ? 'y' : 'ies'} remain in this period`);
    const r = await this.prisma.accountingPeriod.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'CLOSED', closedAt: new Date(), closedById: actor.id } });
    if (!r.count) throw new ConflictException('Period not found or already closed');
    await this.audit.log({ actorId: actor.id, action: 'PERIOD_CLOSED', entityType: 'accounting_period', entityId: id });
    return { closed: true };
  }

  private async periodFor(date: Date) {
    const p = await this.prisma.accountingPeriod.findFirst({ where: { startDate: { lte: date }, endDate: { gte: date } } });
    if (!p) throw new BadRequestException('No accounting period covers that date');
    if (p.status !== 'OPEN') throw new ConflictException(`Period "${p.name}" is closed`);
    return p;
  }

  // ---------- journal workflow ----------
  private async prepareLines(lines: LineInput[]) {
    let clean;
    try { clean = cleanLines(lines); } catch (e: any) { throw new BadRequestException(e.message); }
    const ids = [...new Set(clean.map((l) => l.accountId))];
    const accts = await this.prisma.chartAccount.findMany({ where: { id: { in: ids } } });
    if (accts.length !== ids.length) throw new BadRequestException('Unknown account on a line');
    const inactive = accts.find((a) => !a.isActive);
    if (inactive) throw new BadRequestException(`Account ${inactive.code} is inactive`);
    return clean;
  }

  async createEntry(actor: AuthUser, d: { entryDate: string; description: string; lines: LineInput[] }) {
    const entryDate = day(d.entryDate);
    const period = await this.periodFor(entryDate);
    const lines = await this.prepareLines(d.lines);
    return this.prisma.$transaction(async (tx) => {
      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('journal_ref_seq') AS n`;
      const reference = `JE-${entryDate.getUTCFullYear()}-${n.toString().padStart(6, '0')}`;
      const e = await tx.journalEntry.create({
        data: { reference, entryDate, description: d.description, periodId: period.id, createdById: actor.id, lines: { create: lines } },
        include: { lines: true },
      });
      await this.audit.log({ actorId: actor.id, action: 'JOURNAL_CREATED', entityType: 'journal_entry', entityId: e.id, metadata: { reference } }, tx);
      return e;
    });
  }

  async updateDraft(actor: AuthUser, id: string, d: { entryDate?: string; description?: string; lines?: LineInput[] }) {
    const cur = await this.mustGet(id);
    if (cur.status !== 'DRAFT') throw new ConflictException('Only DRAFT entries can be edited');
    const entryDate = d.entryDate ? day(d.entryDate) : cur.entryDate;
    const period = await this.periodFor(entryDate);
    const lines = d.lines ? await this.prepareLines(d.lines) : null;
    return this.prisma.$transaction(async (tx) => {
      if (lines) { await tx.journalEntryLine.deleteMany({ where: { entryId: id } }); await tx.journalEntryLine.createMany({ data: lines.map((l) => ({ ...l, entryId: id })) }); }
      const e = await tx.journalEntry.update({ where: { id }, data: { entryDate, periodId: period.id, description: d.description ?? cur.description }, include: { lines: true } });
      await this.audit.log({ actorId: actor.id, action: 'JOURNAL_EDITED', entityType: 'journal_entry', entityId: id }, tx);
      return e;
    });
  }

  private async mustGet(id: string) {
    const e = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Journal entry not found');
    return e;
  }

  /** Atomic, state-checked transition + approval trail + audit. */
  private async transition(actor: AuthUser, id: string, from: JournalStatus, to: JournalStatus, action: string, comment?: string, extra: Prisma.JournalEntryUncheckedUpdateManyInput = {}) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.journalEntry.updateMany({ where: { id, status: from }, data: { status: to, ...extra } });
      if (!r.count) {
        const e = await tx.journalEntry.findUnique({ where: { id }, select: { status: true } });
        if (!e) throw new NotFoundException('Journal entry not found');
        throw new ConflictException(`Entry is ${e.status}, expected ${from}`);
      }
      await tx.financialApproval.create({ data: { entryId: id, action, actorId: actor.id, comment } });
      await this.audit.log({ actorId: actor.id, action: `JOURNAL_${action}`, entityType: 'journal_entry', entityId: id, metadata: { comment: comment ?? null } }, tx);
      return tx.journalEntry.findUniqueOrThrow({ where: { id } });
    });
  }

  submit(actor: AuthUser, id: string) { return this.transition(actor, id, 'DRAFT', 'PENDING_APPROVAL', 'SUBMIT'); }

  async approve(actor: AuthUser, id: string, comment?: string) {
    const e = await this.mustGet(id);
    if (e.createdById === actor.id && !ALLOW_SELF_APPROVAL()) throw new ForbiddenException('Segregation of duties: the creator cannot approve their own entry');
    return this.transition(actor, id, 'PENDING_APPROVAL', 'APPROVED', 'APPROVE', comment, { approvedById: actor.id });
  }

  reject(actor: AuthUser, id: string, comment: string) { return this.transition(actor, id, 'PENDING_APPROVAL', 'DRAFT', 'REJECT', comment); }

  async post(actor: AuthUser, id: string) {
    const e = await this.mustGet(id);
    const p = await this.prisma.accountingPeriod.findUniqueOrThrow({ where: { id: e.periodId } });
    if (p.status !== 'OPEN') throw new ConflictException(`Period "${p.name}" is closed`);
    return this.transition(actor, id, 'APPROVED', 'POSTED', 'POST', undefined, { postedAt: new Date() });
  }

  /** Posted books are never edited: a reversal creates a mirror entry and marks the original REVERSED. */
  async reverse(actor: AuthUser, id: string, d: { reason: string; date?: string }) {
    const orig = await this.prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
    if (!orig) throw new NotFoundException('Journal entry not found');
    if (orig.status !== 'POSTED') throw new ConflictException(`Only POSTED entries can be reversed (is ${orig.status})`);
    const date = d.date ? day(d.date) : day(new Date().toISOString().slice(0, 10));
    const period = await this.periodFor(date);
    return this.prisma.$transaction(async (tx) => {
      const flip = await tx.journalEntry.updateMany({ where: { id, status: 'POSTED' }, data: { status: 'REVERSED' } });
      if (!flip.count) throw new ConflictException('Entry was already reversed');
      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('journal_ref_seq') AS n`;
      const rev = await tx.journalEntry.create({
        data: {
          reference: `JE-${date.getUTCFullYear()}-${n.toString().padStart(6, '0')}`, entryDate: date,
          description: `Reversal of ${orig.reference}: ${d.reason}`, periodId: period.id, createdById: actor.id,
          reversesId: id, lines: { create: orig.lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit, description: l.description })) },
        },
      });
      await tx.journalEntry.update({ where: { id: rev.id }, data: { status: 'POSTED', approvedById: actor.id, postedAt: new Date() } });
      await tx.financialApproval.createMany({ data: [
        { entryId: id, action: 'REVERSE', actorId: actor.id, comment: d.reason },
        { entryId: rev.id, action: 'POST', actorId: actor.id, comment: `Reversal of ${orig.reference}` },
      ] });
      await this.audit.log({ actorId: actor.id, action: 'JOURNAL_REVERSED', entityType: 'journal_entry', entityId: id, metadata: { reversalId: rev.id, reason: d.reason } }, tx);
      return { original: id, reversal: rev.id, reference: rev.reference };
    });
  }

  async listEntries(q: { status?: JournalStatus; from?: string; to?: string; page: number; limit: number }) {
    const where: Prisma.JournalEntryWhereInput = {
      status: q.status, entryDate: { gte: q.from ? day(q.from) : undefined, lte: q.to ? day(q.to) : undefined },
    };
    const [items, total] = await Promise.all([
      this.prisma.journalEntry.findMany({ where, orderBy: [{ entryDate: 'desc' }, { reference: 'desc' }], skip: (q.page - 1) * q.limit, take: q.limit, include: { lines: { include: { account: { select: { code: true, name: true } } } } } }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }

  async getEntry(id: string) {
    const e = await this.prisma.journalEntry.findUnique({ where: { id }, include: { lines: { include: { account: true } }, approvals: { orderBy: { createdAt: 'asc' } } } });
    if (!e) throw new NotFoundException('Journal entry not found');
    return e;
  }

  // ---------- reports (POSTED + REVERSED entries; a reversal nets the original to zero) ----------
  async trialBalance(asOf: string) { return trialBalance(await this.balancesStrict(null, day(asOf))); }
  async incomeStatement(from: string, to: string) { return incomeStatement(await this.balancesStrict(day(from), day(to))); }
  async balanceSheet(asOf: string) { return balanceSheet(await this.balancesStrict(null, day(asOf))); }

  private async balancesStrict(from: Date | null, to: Date): Promise<BalanceRow[]> {
    const rows = await this.prisma.$queryRaw<{ code: string; name: string; class: AccountClass; debit: Prisma.Decimal; credit: Prisma.Decimal }[]>`
      SELECT a.code, a.name, a.class,
        COALESCE(SUM(l.debit) FILTER (WHERE e.id IS NOT NULL),0) AS debit,
        COALESCE(SUM(l.credit) FILTER (WHERE e.id IS NOT NULL),0) AS credit
      FROM chart_of_accounts a
      LEFT JOIN journal_entry_lines l ON l.account_id = a.id
      LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.status IN ('POSTED','REVERSED')
        AND e.entry_date <= ${to}::date AND (${from}::date IS NULL OR e.entry_date >= ${from}::date)
      GROUP BY a.code, a.name, a.class`;
    return rows.map((r) => ({ ...r, debit: new Prisma.Decimal(r.debit), credit: new Prisma.Decimal(r.credit) }));
  }

  async reportCsv(kind: 'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow', q: { asOf?: string; from?: string; to?: string }) {
    if (!['trial-balance', 'income-statement', 'balance-sheet', 'cash-flow'].includes(kind)) throw new BadRequestException('Unknown report');
    const f = (d: Prisma.Decimal) => d.toFixed(2);
    if (kind === 'cash-flow') {
      const r = await this.cashFlow(q.from ?? '', q.to ?? '');
      const rows: (string | number)[][] = [['Section', 'Code', 'Account', 'Inflow', 'Outflow', 'Net']];
      for (const k of ['OPERATING', 'INVESTING', 'FINANCING'] as const) {
        r.sections[k].forEach((l) => rows.push([k, l.code, l.name, f(l.inflow), f(l.outflow), f(l.net)]));
        rows.push([k, '', `Net cash from ${k.toLowerCase()} activities`, '', '', f(r[k.toLowerCase() as 'operating'])]);
      }
      rows.push(['', '', 'Net change in cash', '', '', f(r.netChange)], ['', '', 'Opening cash', '', '', f(r.openingCash)], ['', '', 'Closing cash', '', '', f(r.closingCash)]);
      return toCsv(rows);
    }
    if (kind === 'trial-balance') {
      const r = await this.trialBalance(q.asOf ?? ''); 
      return toCsv([['Code', 'Account', 'Class', 'Debit', 'Credit'], ...r.lines.map((l) => [l.code, l.name, l.class, f(l.debit), f(l.credit)]), ['', 'TOTAL', '', f(r.totalDebit), f(r.totalCredit)]]);
    }
    if (kind === 'income-statement') {
      const r = await this.incomeStatement(q.from ?? '', q.to ?? '');
      return toCsv([['Section', 'Code', 'Account', 'Amount'], ...r.income.map((l) => ['Income', l.code, l.name, f(l.amount)]), ['Income', '', 'Total income', f(r.totalIncome)],
        ...r.expenses.map((l) => ['Expense', l.code, l.name, f(l.amount)]), ['Expense', '', 'Total expenses', f(r.totalExpenses)], ['', '', 'Net profit', f(r.netProfit)]]);
    }
    const r = await this.balanceSheet(q.asOf ?? '');
    const sec = (n: string, x: { code: string; name: string; amount: Prisma.Decimal }[]) => x.map((l) => [n, l.code, l.name, f(l.amount)]);
    return toCsv([['Section', 'Code', 'Account', 'Amount'], ...sec('Assets', r.assets), ['Assets', '', 'Total assets', f(r.totalAssets)], ...sec('Liabilities', r.liabilities),
      ['Liabilities', '', 'Total liabilities', f(r.totalLiabilities)], ...sec('Equity', r.equity), ['Equity', '', 'Current earnings', f(r.currentEarnings)], ['Equity', '', 'Total equity', f(r.totalEquity)]]);
  }

  // ---------- cash flow ----------
  async setCashSettings(actor: AuthUser, id: string, d: { isCash?: boolean; cashFlowActivity?: Activity | null }) {
    const a = await this.prisma.chartAccount.findUnique({ where: { id } });
    if (!a) throw new NotFoundException();
    if (d.isCash && a.class !== 'ASSET') throw new BadRequestException('Only ASSET accounts can be cash accounts');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const u = await tx.chartAccount.update({ where: { id }, data: { isCash: d.isCash, cashFlowActivity: d.cashFlowActivity } });
        await this.audit.log({ actorId: actor.id, action: 'COA_CASH_SETTINGS_CHANGED', entityType: 'chart_account', entityId: id, metadata: { ...d } }, tx);
        return u;
      });
    } catch (e: any) {
      if (/cash flag/.test(e?.message ?? '')) throw new ConflictException('Cannot change the cash flag of an account that already has journal lines');
      throw e;
    }
  }

  async cashFlow(from: string, to: string) {
    const f = day(from), t = day(to);
    if (f > t) throw new BadRequestException('from must not be after to');
    const rows = await this.prisma.$queryRaw<{ code: string; name: string; class: AccountClass; activity: Activity | null; inflow: Prisma.Decimal; outflow: Prisma.Decimal }[]>`
      SELECT a.code, a.name, a.class, a.cash_flow_activity AS activity, SUM(l.credit) AS inflow, SUM(l.debit) AS outflow
      FROM journal_entry_lines l
      JOIN journal_entries e ON e.id = l.entry_id AND e.status IN ('POSTED','REVERSED') AND e.entry_date BETWEEN ${f}::date AND ${t}::date
      JOIN chart_of_accounts a ON a.id = l.account_id AND NOT a.is_cash
      WHERE EXISTS (SELECT 1 FROM journal_entry_lines c JOIN chart_of_accounts ca ON ca.id = c.account_id AND ca.is_cash WHERE c.entry_id = e.id)
      GROUP BY a.code, a.name, a.class, a.cash_flow_activity`;
    const cash = async (cond: 'before' | 'upto') => {
      const [r] = await this.prisma.$queryRaw<{ b: Prisma.Decimal | null }[]>`
        SELECT SUM(l.debit - l.credit) AS b FROM journal_entry_lines l
        JOIN journal_entries e ON e.id = l.entry_id AND e.status IN ('POSTED','REVERSED')
        JOIN chart_of_accounts a ON a.id = l.account_id AND a.is_cash
        WHERE (${cond} = 'before' AND e.entry_date < ${f}::date) OR (${cond} = 'upto' AND e.entry_date <= ${t}::date)`;
      return new Prisma.Decimal(r?.b ?? 0);
    };
    return cashFlow(rows.map((r) => ({ ...r, inflow: new Prisma.Decimal(r.inflow), outflow: new Prisma.Decimal(r.outflow) })), await cash('before'), await cash('upto'));
  }

  // ---------- bank reconciliation ----------
  private async cashAccount(id: string) {
    const a = await this.prisma.chartAccount.findUnique({ where: { id } });
    if (!a || !a.isCash) throw new BadRequestException('Not a cash account');
    return a;
  }

  async createRecon(actor: AuthUser, d: { accountId: string; statementDate: string; statementBalance: string }) {
    await this.cashAccount(d.accountId);
    const statementDate = day(d.statementDate);
    const prev = await this.prisma.reconciliationRecord.findFirst({ where: { accountId: d.accountId, status: 'COMPLETED' }, orderBy: { statementDate: 'desc' } });
    if (prev && statementDate <= prev.statementDate) throw new BadRequestException(`Statement date must be after the last completed reconciliation (${prev.statementDate.toISOString().slice(0, 10)})`);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const r = await tx.reconciliationRecord.create({ data: {
          accountId: d.accountId, statementDate, statementBalance: new Prisma.Decimal(d.statementBalance),
          openingBalance: prev?.statementBalance ?? new Prisma.Decimal(0), createdById: actor.id,
        } });
        await this.audit.log({ actorId: actor.id, action: 'RECON_STARTED', entityType: 'reconciliation', entityId: r.id, metadata: d as any }, tx);
        return r;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This account already has an open reconciliation');
      throw e;
    }
  }

  listRecons(accountId?: string) {
    return this.prisma.reconciliationRecord.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' }, include: { account: { select: { code: true, name: true } }, _count: { select: { items: true } } } });
  }

  async getRecon(id: string) {
    const r = await this.prisma.reconciliationRecord.findUnique({ where: { id }, include: { account: { select: { id: true, code: true, name: true } } } });
    if (!r) throw new NotFoundException('Reconciliation not found');
    const cleared = await this.prisma.journalEntryLine.findMany({
      where: { reconItem: { reconId: id } }, include: { entry: { select: { reference: true, entryDate: true, description: true } } }, orderBy: { entry: { entryDate: 'asc' } },
    });
    const candidates = r.status === 'DRAFT' ? await this.prisma.journalEntryLine.findMany({
      where: { accountId: r.accountId, reconItem: null, entry: { status: { in: ['POSTED', 'REVERSED'] }, entryDate: { lte: r.statementDate } } },
      include: { entry: { select: { reference: true, entryDate: true, description: true } } }, orderBy: { entry: { entryDate: 'asc' } },
    }) : [];
    return { ...r, summary: reconciliationSummary(r.openingBalance, r.statementBalance, cleared), cleared, candidates };
  }

  private async draftRecon(id: string) {
    const r = await this.prisma.reconciliationRecord.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Reconciliation not found');
    if (r.status !== 'DRAFT') throw new ConflictException('Reconciliation is already completed');
    return r;
  }

  async markLines(actor: AuthUser, id: string, lineIds: string[], add: boolean) {
    const r = await this.draftRecon(id);
    if (add) {
      const ok = await this.prisma.journalEntryLine.findMany({
        where: { id: { in: lineIds }, accountId: r.accountId, reconItem: null, entry: { status: { in: ['POSTED', 'REVERSED'] }, entryDate: { lte: r.statementDate } } }, select: { id: true },
      });
      if (ok.length !== new Set(lineIds).size) throw new BadRequestException('Some lines are not eligible (wrong account, not posted, after statement date, or already cleared)');
      await this.prisma.reconciliationItem.createMany({ data: ok.map((l) => ({ reconId: id, lineId: l.id })) });
    } else {
      await this.prisma.reconciliationItem.deleteMany({ where: { reconId: id, lineId: { in: lineIds } } });
    }
    await this.audit.log({ actorId: actor.id, action: add ? 'RECON_LINES_CLEARED' : 'RECON_LINES_UNCLEARED', entityType: 'reconciliation', entityId: id, metadata: { count: lineIds.length } });
    return this.getRecon(id);
  }

  async completeRecon(actor: AuthUser, id: string) {
    const r = await this.draftRecon(id);
    if (r.createdById === actor.id && !ALLOW_SELF_APPROVAL()) throw new ForbiddenException('Segregation of duties: the preparer cannot complete their own reconciliation');
    const view = await this.getRecon(id);
    if (!view.summary.reconciled) throw new ConflictException(`Not reconciled: difference ${view.summary.difference.toFixed(2)} (statement ${r.statementBalance.toFixed(2)} vs cleared ${view.summary.clearedBalance.toFixed(2)})`);
    await this.prisma.$transaction(async (tx) => {
      const u = await tx.reconciliationRecord.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'COMPLETED', completedById: actor.id, completedAt: new Date() } });
      if (!u.count) throw new ConflictException('Reconciliation is already completed');
      await this.audit.log({ actorId: actor.id, action: 'RECON_COMPLETED', entityType: 'reconciliation', entityId: id, metadata: { statementBalance: r.statementBalance.toFixed(2) } }, tx);
    });
    return this.getRecon(id);
  }

  async cancelRecon(actor: AuthUser, id: string) {
    await this.draftRecon(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.reconciliationItem.deleteMany({ where: { reconId: id } });
      await tx.reconciliationRecord.delete({ where: { id } });
      await this.audit.log({ actorId: actor.id, action: 'RECON_CANCELLED', entityType: 'reconciliation', entityId: id }, tx);
    });
    return { cancelled: true };
  }

  /** Per cash account: book balance, last reconciled statement and unreconciled activity. */
  async reconStatus() {
    const accts = await this.prisma.chartAccount.findMany({ where: { isCash: true }, orderBy: { code: 'asc' } });
    return Promise.all(accts.map(async (a) => {
      const [bal] = await this.prisma.$queryRaw<{ b: Prisma.Decimal | null; n: bigint }[]>`
        SELECT SUM(l.debit - l.credit) AS b, COUNT(*) FILTER (WHERE ri.id IS NULL) AS n
        FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id AND e.status IN ('POSTED','REVERSED')
        LEFT JOIN reconciliation_items ri ON ri.line_id = l.id WHERE l.account_id = ${a.id}::uuid`;
      const last = await this.prisma.reconciliationRecord.findFirst({ where: { accountId: a.id, status: 'COMPLETED' }, orderBy: { statementDate: 'desc' } });
      return { accountId: a.id, code: a.code, name: a.name, bookBalance: new Prisma.Decimal(bal?.b ?? 0).toFixed(2), unreconciledLines: Number(bal?.n ?? 0),
               lastReconciledDate: last?.statementDate ?? null, lastStatementBalance: last?.statementBalance.toFixed(2) ?? null };
    }));
  }
}
