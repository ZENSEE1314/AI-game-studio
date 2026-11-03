import { csvCell, toCsv } from './csv';
describe('csv', () => {
  it('neutralises spreadsheet formulas in strings but not numbers', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe(`'+1`);
    expect(csvCell('@cmd')).toBe(`'@cmd`);
    expect(csvCell(-5)).toBe('-5');
  });
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv([['a,b', 'c"d', 'e\nf']])).toBe('"a,b","c""d","e\nf"\r\n');
  });
});
