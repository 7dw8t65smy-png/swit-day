import { describe, it, expect } from 'vitest';
import { parseOnlyMonsterSales, toMskParts, shiftFromMskHour } from './agency.js';

describe('parseOnlyMonsterSales', () => {
  it('parses a message sale with glued year+time and three amounts', () => {
    const text = `Jun 14, 202611:08 pm\t$5.69\t$1.14\t$4.55
Payment for message from Lyrec`;
    const out = parseOnlyMonsterSales(text);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      year: 2026,
      month: 6,
      day: 14,
      hour: 23,
      minute: 8,
      amount: 5.69,
      fee: 1.14,
      net: 4.55,
      kind: 'message',
      fan_name: 'Lyrec'
    });
  });

  it('classifies tip / post / subscription and extracts fan name', () => {
    const text = `Jun 14, 2026 6:52 pm\t$25.00\t$5.00\t$20.00
Tip from MNAquas
Jun 14, 2026 1:00 am\t$10.00\t$2.00\t$8.00
Post purchase by Matúš Galya
Jun 14, 2026 9:00 am\t$30.00\t$6.00\t$24.00
Subscription from Mike`;
    const out = parseOnlyMonsterSales(text);
    expect(out.map((s) => s.kind)).toEqual(['tip', 'post', 'subscription']);
    expect(out.map((s) => s.fan_name)).toEqual(['MNAquas', 'Matúš Galya', 'Mike']);
  });

  it('handles commas in amounts and a missing fee (gross/net only)', () => {
    const text = `Jan 2, 2026 5:00 pm\t$1,200.00\t$960.00
Tip from Whale`;
    const out = parseOnlyMonsterSales(text);
    expect(out[0].amount).toBe(1200);
    expect(out[0].net).toBe(960);
    expect(out[0].fee).toBe(240);
  });

  it('ignores junk lines that are not sales', () => {
    const text = `Spenders Online
Jun 14, 2026 11:08 pm\t$5.69\t$1.14\t$4.55
Payment for message from Lyrec
random footer text`;
    expect(parseOnlyMonsterSales(text)).toHaveLength(1);
  });
});

describe('shiftFromMskHour', () => {
  it('maps boundaries to the right shift', () => {
    expect(shiftFromMskHour(7)).toBe('morning');
    expect(shiftFromMskHour(12)).toBe('morning');
    expect(shiftFromMskHour(13)).toBe('day');
    expect(shiftFromMskHour(19)).toBe('evening');
    expect(shiftFromMskHour(0)).toBe('evening');
    expect(shiftFromMskHour(1)).toBe('night');
    expect(shiftFromMskHour(6)).toBe('night');
  });
});

describe('toMskParts', () => {
  it('converts an OnlyMonster UTC+5 time to MSK shift (welcome message case)', () => {
    // 6:14 am at UTC+5 → 01:14 UTC → 04:14 MSK → night shift.
    const parts = toMskParts({ year: 2026, month: 6, day: 14, hour: 6, minute: 14 }, 300);
    expect(parts.occurredAtUtc).toBe('2026-06-14T01:14:00.000Z');
    expect(parts.mskHour).toBe(4);
    expect(parts.shift).toBe('night');
    expect(parts.mskDate).toBe('2026-06-14');
  });

  it('keeps the MSK calendar date correct across the UTC offset', () => {
    // 2026-06-14 02:00 +5 = 2026-06-13 21:00 UTC → +3 = 2026-06-14 00:00 MSK.
    const parts = toMskParts({ year: 2026, month: 6, day: 14, hour: 2, minute: 0 }, 300);
    expect(parts.mskDate).toBe('2026-06-14');
    expect(parts.mskHour).toBe(0);
    expect(parts.shift).toBe('evening');
  });
});
