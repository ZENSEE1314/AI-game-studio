import { Prisma } from '@prisma/client';
import { balanceSheet, cleanLines, incomeStatement, trialBalance, BalanceRow } from './accounting.math';

const D = (n: number) => new Prisma.Decimal(n);
const row = (code: string, cls: BalanceRow['class'], debit: number, credit: number): BalanceRow => ({ code, name: code, class: cls, debit: D(debit), credit: D(credit) });

describe('cleanLines', () => {
  const l = (a: string, d?: string, c?: string) => ({ accountId: a, debit: d, credit: c });
  it('accepts a balanced entry', () => expect(cleanLines([l('a', '100.50'), l('b', undefined, '100.50')])).toHaveLength(2));
  it('rejects unbalanced', () => expect(() => cleanLines([l('a', '100'), l('b', undefined, '99.99')])).toThrow(/not balanced/));
  it('rejects a single line', () => expect(() => cleanLines([l('a', '5')])).toThrow(/at least two/));
  it('rejects both sides on one line', () => expect(() => cleanLines([l('a', '5', '5'), l('b', undefined, '5')])).toThrow(/exactly one/));
  it('rejects zero lines', () => expect(() => cleanLines([l('a', '0'), l('b', '0')])).toThrow(/exactly one/));
  it('rejects negatives and >2dp', () => {
    expect(() => cleanLines([l('a', '-5'), l('b', undefined, '5')])).toThrow(/invalid/);
    expect(() => cleanLines([l('a', '1.005'), l('b', undefined, '1.005')])).toThrow(/2 decimal/);
  });
  it('has no floating point drift', () => expect(() => cleanLines([l('a', '0.1'), l('a', '0.2'), l('b', undefined, '0.3')])).not.toThrow());
});

describe('reports', () => {
  // Owner funds 1000; 300 revenue received in cash; 100 expense paid in cash => cash 1200.
  const rows = [row('1000', 'ASSET', 1300, 100), row('3000', 'EQUITY', 0, 1000), row('4000', 'INCOME', 0, 300), row('5000', 'EXPENSE', 100, 0)];
  it('trial balance balances', () => {
    const t = trialBalance(rows);
    expect(t.balanced).toBe(true);
    expect(t.totalDebit.toFixed(2)).toBe('1300.00');
    expect(t.totalCredit.toFixed(2)).toBe('1300.00');
  });
  it('income statement', () => {
    const p = incomeStatement(rows);
    expect(p.totalIncome.toFixed(2)).toBe('300.00');
    expect(p.totalExpenses.toFixed(2)).toBe('100.00');
    expect(p.netProfit.toFixed(2)).toBe('200.00');
  });
  it('balance sheet balances including current earnings', () => {
    const b = balanceSheet(rows);
    expect(b.totalAssets.toFixed(2)).toBe('1200.00');
    expect(b.totalEquity.toFixed(2)).toBe('1200.00');
    expect(b.balanced).toBe(true);
  });
  it('a reversal nets an entry to zero', () => {
    const t = trialBalance([row('1000', 'ASSET', 500, 500), row('4000', 'INCOME', 500, 500)]);
    expect(t.lines).toHaveLength(0);
    expect(t.balanced).toBe(true);
  });
});

import { cashFlow, effectiveActivity, reconciliationSummary } from './accounting.math';
describe('cash flow', () => {
  const r = (code: string, cls: any, activity: any, inflow: number, outflow: number) => ({ code, name: code, class: cls, activity, inflow: D(inflow), outflow: D(outflow) });
  it('defaults activity by class', () => {
    expect(effectiveActivity('EQUITY', null)).toBe('FINANCING');
    expect(effectiveActivity('INCOME', null)).toBe('OPERATING');
    expect(effectiveActivity('ASSET', 'INVESTING')).toBe('INVESTING');
  });
  it('sections sum to net change and reconcile to closing cash', () => {
    const cf = cashFlow([r('3000', 'EQUITY', null, 1000, 0), r('4000', 'INCOME', null, 300, 0), r('5000', 'EXPENSE', null, 0, 100), r('1500', 'ASSET', 'INVESTING', 0, 400)], D(50), D(850));
    expect(cf.operating.toFixed(2)).toBe('200.00');
    expect(cf.investing.toFixed(2)).toBe('-400.00');
    expect(cf.financing.toFixed(2)).toBe('1000.00');
    expect(cf.netChange.toFixed(2)).toBe('800.00');
    expect(cf.reconciles).toBe(true);
  });
  it('flags a mismatch', () => expect(cashFlow([r('4000', 'INCOME', null, 10, 0)], D(0), D(11)).reconciles).toBe(false));
});
describe('reconciliation', () => {
  it('matches when cleared lines explain the statement', () => {
    const s = reconciliationSummary(D(1000), D(1250), [{ debit: D(300), credit: D(0) }, { debit: D(0), credit: D(50) }]);
    expect(s.clearedBalance.toFixed(2)).toBe('1250.00');
    expect(s.reconciled).toBe(true);
  });
  it('reports the difference', () => {
    const s = reconciliationSummary(D(0), D(100), [{ debit: D(90), credit: D(0) }]);
    expect(s.difference.toFixed(2)).toBe('10.00');
    expect(s.reconciled).toBe(false);
  });
});
