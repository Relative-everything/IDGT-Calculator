import { useState } from 'react';
import { useContainerWidth } from './useContainerWidth.js';
import { fmtMoney, fmtMoneyCompact } from '../format.js';

const M = { top: 20, right: 24, bottom: 34, left: 64 };
const H = 240;

function niceTicks(lo, hi, n = 4) {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(lo / step) * step;
  const ticks = [];
  for (let v = start; v <= hi + 1e-9; v += step) ticks.push(v);
  return ticks;
}

/** NPV as a function of the swap year. Single series; the no-swap NPV is a reference line. */
export default function SwapCurveChart({ curve, sStar, npvNone, expectedDeathYear }) {
  const [ref, width] = useContainerWidth();
  const [hover, setHover] = useState(null);
  const points = curve.filter((c) => c.s > 0);
  const feasible = points.filter((c) => c.feasible);
  const N = points.length;
  if (N === 0) return null;
  const ys = [...feasible.map((c) => c.npv), npvNone, 0];
  const lo = Math.min(...ys); const hi = Math.max(...ys);
  const pad = (hi - lo) * 0.08 || 1;
  const yMin = lo - pad; const yMax = hi + pad;
  const plotW = Math.max(120, width - M.left - M.right);
  const x = (s) => M.left + ((s - 1) / Math.max(1, N - 1)) * plotW;
  const y = (v) => M.top + (1 - (v - yMin) / (yMax - yMin)) * (H - M.top - M.bottom);
  const path = feasible.map((c, i) => `${i === 0 || !points[c.s - 2]?.feasible ? 'M' : 'L'}${x(c.s).toFixed(1)},${y(c.npv).toFixed(1)}`).join(' ');
  const ticks = niceTicks(yMin, yMax, 4);
  const xTicks = niceTicks(1, N, Math.min(8, N)).filter((v) => Number.isInteger(v) && v >= 1 && v <= N);
  const best = points.find((c) => c.s === sStar);
  const hovered = hover != null ? points[hover] : null;
  const slot = plotW / Math.max(1, N - 1);

  return (
    <div ref={ref} className="relative">
      <svg width="100%" height={H} viewBox={`0 0 ${Math.max(width, 200)} ${H}`} role="img" aria-label="NPV by swap year">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth="1" />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)" className="tabular">{fmtMoneyCompact(t)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={H - M.bottom + 16} textAnchor="middle" fontSize="11" fill="var(--ink-muted)" className="tabular">{t}</text>
        ))}
        <text x={M.left + plotW / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--ink-2)">swap year (end of year)</text>
        {/* no-swap reference */}
        <line x1={M.left} x2={M.left + plotW} y1={y(npvNone)} y2={y(npvNone)} stroke="var(--ink-muted)" strokeWidth="1.5" />
        <text x={M.left + plotW - 4} y={y(npvNone) - 6} textAnchor="end" fontSize="11" fill="var(--ink-2)">no swap {fmtMoneyCompact(npvNone)}</text>
        {expectedDeathYear && expectedDeathYear <= N && (
          <line x1={x(expectedDeathYear)} x2={x(expectedDeathYear)} y1={M.top} y2={H - M.bottom} stroke="var(--line-strong)" strokeWidth="1" />
        )}
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.filter((c) => !c.feasible).map((c) => (
          <circle key={c.s} cx={x(c.s)} cy={H - M.bottom} r="2.5" fill="var(--ink-muted)" />
        ))}
        {best && sStar > 0 && (
          <g>
            <circle cx={x(best.s)} cy={y(best.npv)} r="7" fill="var(--surface)" />
            <circle cx={x(best.s)} cy={y(best.npv)} r="5" fill="var(--series-1)" />
            <text x={x(best.s)} y={y(best.npv) - 12} textAnchor={best.s > N * 0.8 ? 'end' : best.s < N * 0.2 ? 'start' : 'middle'} fontSize="11" fontWeight="600" fill="var(--ink-1)">
              best: year {best.s} · {fmtMoneyCompact(best.npv)}
            </text>
          </g>
        )}
        {hovered && hovered.feasible && (
          <g>
            <line x1={x(hovered.s)} x2={x(hovered.s)} y1={M.top} y2={H - M.bottom} stroke="var(--line-strong)" strokeWidth="1" />
            <circle cx={x(hovered.s)} cy={y(hovered.npv)} r="6" fill="var(--surface)" />
            <circle cx={x(hovered.s)} cy={y(hovered.npv)} r="4" fill="var(--series-1)" />
          </g>
        )}
        {/* hit targets */}
        {points.map((c, i) => (
          <rect key={c.s} x={x(c.s) - slot / 2} y={M.top} width={Math.max(slot, 8)} height={H - M.top - M.bottom} fill="transparent"
            tabIndex={0} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)}
            aria-label={`year ${c.s}: ${c.feasible ? fmtMoney(c.npv) : c.reason}`} />
        ))}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute rounded-md border border-line bg-surface px-2 py-1 text-xs shadow"
          style={{ left: Math.min(Math.max(x(hovered.s) - 60, 0), Math.max(0, width - 170)), top: 4 }}>
          <div className="font-medium text-ink">Swap at end of year {hovered.s}</div>
          <div className="tabular text-ink-2">{hovered.feasible ? `NPV ${fmtMoney(hovered.npv)}` : `not feasible — ${hovered.reason}`}</div>
        </div>
      )}
      <details className="mt-1 text-xs text-ink-2">
        <summary className="text-muted underline-offset-2 hover:underline">Table view</summary>
        <div className="scroll-x mt-1 max-h-48">
          <table className="tabular w-full text-xs">
            <thead><tr className="text-left text-muted"><th className="pr-3">Swap year</th><th className="pr-3 text-right">NPV</th><th>Note</th></tr></thead>
            <tbody>
              <tr><td>none</td><td className="text-right">{fmtMoney(npvNone)}</td><td /></tr>
              {points.map((c) => (
                <tr key={c.s} className={c.s === sStar ? 'font-semibold text-ink' : ''}><td>{c.s}</td><td className="text-right">{c.feasible ? fmtMoney(c.npv) : '—'}</td><td>{c.feasible ? '' : c.reason}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
