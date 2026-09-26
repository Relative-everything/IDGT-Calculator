import { useState } from 'react';
import { useContainerWidth } from './useContainerWidth.js';
import { fmtMoney, fmtMoneyCompact } from '../format.js';

const ROWS = [
  { key: 'freeze', label: 'Freeze', tip: 'Estate tax avoided on the growth above the frozen gift value (incl. discount leverage), measured on a trust that paid its own tax.' },
  { key: 'burn', label: 'Tax burn', tip: 'Estate tax avoided because the grantor, not the trust, pays the income tax (§671) — the trust compounds gross.' },
  { key: 'giftTax', label: 'Gift tax', tip: 'Net effect of paying gift tax now: tax-exclusivity benefit less §2035(b) add-back and lost growth on the tax paid.' },
  { key: 'resid', label: 'Residual', tip: 'Non-neutral consideration or sale differential, anti-clawback, discount-at-death inclusion. Zero under default conventions.' },
  { key: 'stepUp', label: 'Step-up', tip: 'Heirs\' capital-gains tax on gain that would have been erased by §1014 had the asset stayed in the estate (negative), or recovered by a swap.' },
];
const BAR = 12; const GAP = 2; const BAND = 40;
const M = { left: 84, right: 8, top: 28, bottom: 8 };

/** Two-series horizontal bar chart: components of NPV, no swap vs optimal swap. Legend present (2 series). */
export default function DecompositionChart({ none, opt, npvNone, npvOpt, sStar }) {
  const [ref, width] = useContainerWidth();
  const [hover, setHover] = useState(null);
  const rows = [...ROWS, { key: 'total', label: 'Total NPV', total: true }];
  const series = [
    { key: 'none', label: 'No swap', color: 'var(--series-1)', get: (k) => (k === 'total' ? npvNone : none[k]) },
    { key: 'opt', label: sStar > 0 ? `Swap in year ${sStar}` : 'Best (no swap)', color: 'var(--series-2)', get: (k) => (k === 'total' ? npvOpt : opt[k]) },
  ];
  const values = rows.flatMap((r) => series.map((s) => s.get(r.key)));
  // Asymmetric scale: bars extend left for negatives and right for positives, with LABEL px reserved
  // beyond each extent so tip labels never run into the row labels or off the plot.
  const LABEL = 64;
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values);
  const span = Math.max(1, maxV - minV);
  const plotW = Math.max(160, width - M.left - M.right);
  const scale = Math.max(0, plotW - 2 * LABEL) / span;
  const x0 = M.left + LABEL + (-minV) * scale;
  const H = M.top + rows.length * BAND + M.bottom;

  return (
    <div ref={ref} className="relative">
      <div className="mb-1 flex flex-wrap items-center gap-4 text-xs text-ink-2">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${Math.max(width, 200)} ${H}`} role="img" aria-label="NPV components, no swap versus optimal swap">
        <line x1={x0} x2={x0} y1={M.top - 10} y2={H - M.bottom} stroke="var(--axis)" strokeWidth="1" />
        {rows.map((r, i) => {
          const yBand = M.top + i * BAND;
          return (
            <g key={r.key}>
              {i > 0 && <line x1={M.left} x2={M.left + plotW} y1={yBand - 4} y2={yBand - 4} stroke="var(--grid)" strokeWidth="1" />}
              <text x={M.left - 8} y={yBand + BAND / 2 + 1} textAnchor="end" fontSize="12" fontWeight={r.total ? 600 : 400} fill="var(--ink-1)">
                <title>{r.tip}</title>{r.label}
              </text>
              {series.map((s, j) => {
                const v = s.get(r.key);
                const w = Math.abs(v) * scale;
                const y = yBand + (BAND - (BAR * 2 + GAP)) / 2 + j * (BAR + GAP);
                const isHover = hover && hover.row === r.key && hover.series === s.key;
                const rx = 4;
                const xLeft = v >= 0 ? x0 : x0 - w;
                const labelX = v >= 0 ? x0 + w + 6 : x0 - w - 6;
                return (
                  <g key={s.key}>
                    <rect x={xLeft} y={y} width={Math.max(w, 0.5)} height={BAR} rx={rx} fill={s.color} opacity={hover && !isHover ? 0.55 : 1} />
                    <text x={labelX} y={y + BAR - 2} textAnchor={v >= 0 ? 'start' : 'end'} fontSize="11" fill="var(--ink-2)" className="tabular">{fmtMoneyCompact(v)}</text>
                    <rect x={M.left} y={y - 1} width={plotW} height={BAR + 2} fill="transparent" tabIndex={0}
                      onMouseEnter={() => setHover({ row: r.key, series: s.key, v, label: r.label, sLabel: s.label, y })}
                      onFocus={() => setHover({ row: r.key, series: s.key, v, label: r.label, sLabel: s.label, y })}
                      onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)}
                      aria-label={`${r.label}, ${s.label}: ${fmtMoney(v)}`} />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute right-2 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow" style={{ top: Math.max(0, hover.y - 8) }}>
          <div className="font-medium text-ink">{hover.label} · {hover.sLabel}</div>
          <div className="tabular text-ink-2">{fmtMoney(hover.v)}</div>
        </div>
      )}
      <details className="mt-1 text-xs text-ink-2">
        <summary className="text-muted underline-offset-2 hover:underline">Table view</summary>
        <table className="tabular mt-1 w-full text-xs">
          <thead><tr className="text-left text-muted"><th>Component</th><th className="text-right">No swap</th><th className="text-right">{series[1].label}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.total ? 'font-semibold text-ink' : ''}>
                <td>{r.label}</td><td className="text-right">{fmtMoney(series[0].get(r.key))}</td><td className="text-right">{fmtMoney(series[1].get(r.key))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
