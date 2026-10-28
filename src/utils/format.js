// Colombian peso formatting helpers.

const nf = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** 1750905 -> "COP $1.750.905" */
export function formatCOP(amount) {
  const n = Math.round(amount);
  const sign = n < 0 ? '-' : '';
  return `${sign}COP $${nf.format(Math.abs(n))}`;
}

/** Signed variant for profit/loss: "+COP $10.000" / "-COP $10.000". */
export function formatSignedCOP(amount) {
  if (amount > 0) return `+${formatCOP(amount)}`;
  return formatCOP(amount);
}

/** Short label for chips drawn on the table: 50.000 -> "50K", 1.750.905 -> "1,75M". */
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
