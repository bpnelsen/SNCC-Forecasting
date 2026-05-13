export function formatCurrency(value: number, compact = false): string {
  if (compact) {
    if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
    if (Math.abs(value) >= 1_000_000)     return `$${(value / 1_000_000).toFixed(1)}M`
    if (Math.abs(value) >= 1_000)         return `$${(value / 1_000).toFixed(0)}K`
    return `$${value.toFixed(0)}`
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value)
}

export function formatPct(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatVariance(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${formatCurrency(value, true)}`
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
