export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCurrency(value: number): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return `$${formatted}`;
}

export function formatSignedCurrency(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatCurrency(value)}`;
}

export function formatPercent(value: number, decimals: number = 2): string {
  return `${formatNumber(value * 100, decimals)}%`;
}
