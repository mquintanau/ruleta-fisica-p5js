const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

export function formatCOP(amount) {
  const n = Math.round(amount);
  const sign = n < 0 ? '-' : '';
  return `${sign}COP $${nf.format(Math.abs(n))}`;
}

export function formatSignedCOP(amount) {
  if (amount > 0) return `+${formatCOP(amount)}`;
  return formatCOP(amount);
}

export function formatCompact(amount) {
  if (amount >= 1e6) {
    return `${(Math.floor(amount / 1e4) / 100).toLocaleString('es-CO', { maximumFractionDigits: 2 })}M`;
  }
  if (amount >= 1e3) return `${Math.floor(amount / 1e3)}K`;
  return String(amount);
}

export function formatPercent(p) {
  return `${(p * 100).toLocaleString('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}
