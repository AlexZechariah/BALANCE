export function formatMoney(amountMinor: number | null | undefined, currency = 'MYR'): string {
  if (amountMinor == null) return 'Not captured';
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: currency || 'MYR',
    currencyDisplay: 'narrowSymbol'
  }).format(amountMinor / 100);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('en-MY').format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not captured';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-MY', { year: 'numeric', month: 'short', day: '2-digit' }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not captured';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-MY', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

/** Capitalize first letter of a string. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Split on word separators (., _, -, space) and capitalize each word. */
export function titleCase(s: string): string {
  if (!s) return s;
  return s.split(/[._\-\s]+/).filter(Boolean).map(capitalize).join(' ');
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'No baseline';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}
