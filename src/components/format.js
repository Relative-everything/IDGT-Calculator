// Display formatting only. No calculation logic in components (repo rule).

const money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const num0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function fmtMoney(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return money0.format(Math.abs(v) < 0.5 ? 0 : v);
}

/** Signed, compact money for tiles: +$1.2M / −$83K */
export function fmtMoneyCompact(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (Math.abs(v) < 0.5) return '$0';
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  let s;
  if (a >= 1e9) s = `$${(a / 1e9).toFixed(2)}B`;
  else if (a >= 1e6) s = `$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  else if (a >= 1e3) s = `$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  else s = `$${a.toFixed(0)}`;
  return sign + s;
}

export function fmtNum(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return num0.format(v);
}

export function fmtPct(v, digits = 2) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

/** Ratio as cents per dollar, e.g. 0.1049 → "10.5¢ / $" */
export function fmtRatio(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const c = v * 100;
  const sign = c < 0 ? '−' : '';
  return `${sign}${Math.abs(c).toFixed(Math.abs(c) >= 10 ? 1 : 2)}¢/$`;
}

export function fmtYear(s) {
  if (s == null) return '—';
  return s === 0 ? 'none' : `yr ${s}`;
}

export function fmtDecimal(v, digits = 1) {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

/**
 * Sub-line for the deathbed-swap tile. The value is NOT an upper bound (docs/changes/2026-09-27-math-evals, F3): when the
 * swapped-in consideration out-earns the asset, an early fixed-year swap beats swapping in the year of death, so the
 * note states which way the comparison went (the caller passes the comparison; no arithmetic here).
 */
export function deathbedNote(aboveBest, allFeasible) {
  const where = allFeasible ? 'swap at the end of the year of death' : 'swap in the death year where feasible';
  return aboveBest ? `${where}; beats the best fixed year` : `${where}; below the best fixed year (an earlier swap compounds more)`;
}
