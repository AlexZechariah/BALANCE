import { categoryLabel as sharedCategoryLabel } from './display-labels';

export function compactMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat('en-MY', { month: 'short', year: '2-digit' }).format(new Date(year, monthNumber - 1, 1));
}

export function minorToMajor(amountMinor: number | null | undefined): number {
  return (amountMinor ?? 0) / 100;
}

export function categoryLabel(value: string): string {
  return sharedCategoryLabel(value);
}
