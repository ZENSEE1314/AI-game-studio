import { AccountClass, Prisma } from '@prisma/client';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export const ZERO = D(0);

export interface LineInput { accountId: string; debit?: string | number; credit?: string | number; description?: string }
export interface CleanLine { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal; description?: string }

/** Validates amounts (2dp, positive, one side only) and that the entry balances. Throws Error(message). */
export function cleanLines(lines: LineInput[]): CleanLine[] {
  if (!Array.isArray(lines) || lines.length < 2) throw new Error('A journal entry needs at least two lines');
  const out = lines.map((l, i) => {
    const debit = D(l.debit ?? 0), credit = D(l.credit ?? 0);
    if (debit.isNaN() || credit.isNaN() || debit.isNeg() || credit.isNeg()) throw new Error(`Line ${i + 1}: invalid amount`);
    if (debit.decimalPlaces() > 2 || credit.decimalPlaces() > 2) throw new Error(`Line ${i + 1}: at most 2 decimal places`);
    if (debit.gt(0) === credit.gt(0)) throw new Error(`Line ${i + 1}: exactly one of debit or credit must be greater than zero`);
    return { accountId: l.accountId, debit, credit, description: l.description };
  });
  const td = out.reduce((a, l) => a.plus(l.debit), ZERO), tc = out.reduce((a, l) => a.plus(l.credit), ZERO);
  if (!td.equals(tc)) throw new Error(`Entry is not balanced: debit ${td.toFixed(2)} vs credit ${tc.toFixed(2)}`);
  return out;
}

export const isDebitNormal = (c: AccountClass) => c === 'ASSET' || c === 'EXPENSE';

export interface BalanceRow { code: string; name: string; class: AccountClass; debit: Prisma.Decimal; credit: Prisma.Decimal }

/** Signed balance in the account's natural direction (positive = normal). */
export const naturalBalance = (r: BalanceRow) => (isDebitNormal(r.class) ? r.debit.minus(r.credit) : r.credit.minus(r.debit));

export function trialBalance(rows: BalanceRow[]) {
  const lines = rows.map((r) => {
    const net = r.debit.minus(r.credit);
    return { code: r.code, name: r.name, class: r.class, debit: net.gt(0) ? net : ZERO, credit: net.lt(0) ? net.neg() : ZERO };
  }).filter((l) => !l.debit.isZero() || !l.credit.isZero()).sort((a, b) => a.code.localeCompare(b.code));
  const totalDebit = lines.reduce((a, l) => a.plus(l.debit), ZERO), totalCredit = lines.reduce((a, l) => a.plus(l.credit), ZERO);
  return { lines, totalDebit, totalCredit, balanced: totalDebit.equals(totalCredit) };
}

export function incomeStatement(rows: BalanceRow[]) {
  const pick = (c: AccountClass) => rows.filter((r) => r.class === c).map((r) => ({ code: r.code, name: r.name, amount: naturalBalance(r) }))
    .filter((l) => !l.amount.isZero()).sort((a, b) => a.code.localeCompare(b.code));
  const income = pick('INCOME'), expenses = pick('EXPENSE');
  const totalIncome = income.reduce((a, l) => a.plus(l.amount), ZERO), totalExpenses = expenses.reduce((a, l) => a.plus(l.amount), ZERO);
  return { income, expenses, totalIncome, totalExpenses, netProfit: totalIncome.minus(totalExpenses) };
}

export function balanceSheet(rows: BalanceRow[]) {
  const pick = (c: AccountClass) => rows.filter((r) => r.class === c).map((r) => ({ code: r.code, name: r.name, amount: naturalBalance(r) }))
    .filter((l) => !l.amount.isZero()).sort((a, b) => a.code.localeCompare(b.code));
  const assets = pick('ASSET'), liabilities = pick('LIABILITY'), equity = pick('EQUITY');
  const sum = (x: { amount: Prisma.Decimal }[]) => x.reduce((a, l) => a.plus(l.amount), ZERO);
  const earnings = incomeStatement(rows).netProfit; // unclosed profit to date
  const totalAssets = sum(assets), totalLiabilities = sum(liabilities), totalEquity = sum(equity).plus(earnings);
  return {
    assets, liabilities, equity, currentEarnings: earnings, totalAssets, totalLiabilities, totalEquity,
    balanced: totalAssets.equals(totalLiabilities.plus(totalEquity)),
  };
}
