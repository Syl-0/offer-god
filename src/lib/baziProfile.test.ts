import { describe, expect, it } from 'vitest';
import { computeBaziSummary, formatBaziSummaryForLlm } from './baziProfile';

describe('baziProfile', () => {
  it('computes summary with dayun and liunian fields', () => {
    const s = computeBaziSummary(
      {
        year: 1999,
        month: 5,
        day: 25,
        hour: 14,
        minute: 30,
        second: 0,
        gender: 1,
        sect: 2,
        yunSect: 2,
      },
      new Date('2026-03-28T12:00:00+08:00'),
    );
    expect(s.pillars.length).toBeGreaterThan(4);
    expect(s.dayMaster).toMatch(/./);
    const txt = formatBaziSummaryForLlm(s);
    expect(txt).toContain('四柱');
    expect(txt).toContain('五行力量');
  });
});
