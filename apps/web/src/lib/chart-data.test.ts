import { describe, expect, it } from 'vitest';

import { categoryLabel, compactMonthLabel, minorToMajor } from './chart-data';

describe('chart data formatting helpers', () => {
  it('formats compact month labels without hiding the year', () => {
    expect(compactMonthLabel('2026-05')).toBe('May 26');
    expect(compactMonthLabel('not-a-month')).toBe('not-a-month');
  });

  it('converts integer minor units to major units', () => {
    expect(minorToMajor(12345)).toBe(123.45);
    expect(minorToMajor(null)).toBe(0);
    expect(minorToMajor(undefined)).toBe(0);
  });

  it('normalizes category labels for chart legends and tooltips', () => {
    expect(categoryLabel('food-and-beverage')).toBe('Food And Beverage');
    expect(categoryLabel('tax records')).toBe('Tax Records');
    expect(categoryLabel('warranty_return')).toBe('Warranty Return');
  });
});
