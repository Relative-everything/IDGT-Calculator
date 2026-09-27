import { useState } from 'react';
import { useContainerWidth } from './useContainerWidth.js';
import { fmtMoney, fmtMoneyCompact, fmtPct } from '../format.js';

// Heir-wealth gain over HOLD by year of death: the ING (row.dH) against the IDGT at its best fixed swap year
// (row.dHIdgt), both supplied by the engine (ING model.md §5, §9). Display only.

const M = { top: 22, right: 100, bottom: 34, left: 62 };
const H = 250;
const COLOR = { ING: 'var(--series-2)', IDGT: 'var(--series-1)' };
const LABEL_MIN_GAP = 14; // px between the two end labels before they are split to opposite sides

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

function LineKey({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: color }} />{label}
    </span>
  );
}

/**
 * @param {{ rows: { t: number, age: number, q: number, dH: number, dHIdgt: number }[], leadYears?: number[], expectedDeathYear?: number, sStar: number, maxYears?: number }} props
 *   leadYears: the engine's `vsIdgt.ingLeadsYears` (years the ING leads, with the model's tie tolerance)
 */
export default function CrossoverChart({ rows, leadYears = [], expectedDeathYear, sStar, maxYears, married = false }) {
  const [ref, width] = useContainerWidth();
  const [hover, setHover] = useState(null);
  if (!rows?.length) return null;
  const truncate = Number.isInteger(maxYears) && maxYears > 0 && maxYears < rows.length;
  const shown = truncate ? rows.slice(0, maxYears) : rows;
  const hidden = rows.length - shown.length;
  const N = shown.length;
  const idgtLabel = sStar > 0 ? `IDGT (swap yr ${sStar})` : 'IDGT (no swap)';

  const W = Math.max(width, 240);
  const values = [...shown.flatMap((r) => [r.dH, r.dHIdgt]), 0];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.08 || 1;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const plotW = Math.max(100, W - M.left - M.right);
  const plotBottom = H - M.bottom;
  const x = (t) => M.left + ((t - 1) / Math.max(1, N - 1)) * plotW;
  const y = (v) => M.top + (1 - (v - yMin) / (yMax - yMin)) * (plotBottom - M.top);
  const slot = plotW / Math.max(1, N - 1);
  const path = (key) => shown.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.t).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ');
  const ticks = niceTicks(yMin, yMax, 5);
  const xTicks = niceTicks(1, N, Math.min(8, N)).filter((v) => Number.isInteger(v) && v >= 1 && v <= N);

  // Years the ING leads (from the engine), merged into consecutive runs for the shading.
  const leads = new Set(leadYears);
  const runs = [];
  shown.forEach((r) => {
    if (!leads.has(r.t)) return;
    const last = runs[runs.length - 1];
    if (last && last.to === r.t - 1) last.to = r.t;
    else runs.push({ from: r.t, to: r.t });
  });
  const clampX = (px) => Math.min(M.left + plotW, Math.max(M.left, px));

  // End-of-line labels at the last shown year; split to opposite sides when they would collide.
  const last = shown[N - 1];
  const xEnd = x(last.t);
  const yIng = y(last.dH);
  const yIdgt = y(last.dHIdgt);
  let labIng = yIng;
  let labIdgt = yIdgt;
  const collide = Math.abs(yIng - yIdgt) < LABEL_MIN_GAP;
  if (collide) {
    const mid = (yIng + yIdgt) / 2;
    const ingAbove = yIng <= yIdgt;
    labIng = mid + (ingAbove ? -LABEL_MIN_GAP / 2 - 1 : LABEL_MIN_GAP / 2 + 1);
    labIdgt = mid + (ingAbove ? LABEL_MIN_GAP / 2 + 1 : -LABEL_MIN_GAP / 2 - 1);
  }
  const endLabels = [
    { key: 'ING', name: 'ING', v: last.dH, yLine: yIng, yLab: labIng },
    { key: 'IDGT', name: 'IDGT', v: last.dHIdgt, yLine: yIdgt, yLab: labIdgt },
  ];

  const showDeath = Number.isFinite(expectedDeathYear) && expectedDeathYear >= 1 && expectedDeathYear <= N;
  const deathAnchor = showDeath && x(expectedDeathYear) > M.left + plotW - 40 ? 'end' : showDeath && x(expectedDeathYear) < M.left + 40 ? 'start' : 'middle';
  const hovered = hover != null ? shown[hover] : null;
  const tipLeft = hovered ? (x(hovered.t) > M.left + plotW / 2 ? Math.max(0, x(hovered.t) - 12 - 184) : Math.min(x(hovered.t) + 12, Math.max(0, W - 184))) : 0;

  return (
    <div ref={ref} className="relative">
      <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        <LineKey color={COLOR.ING} label="ING" />
        <LineKey color={COLOR.IDGT} label={idgtLabel} />
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'color-mix(in oklab, var(--series-2) 10%, transparent)', boxShadow: 'inset 0 0 0 1px var(--grid)' }} />years the ING leads
        </span>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Heir-wealth gain by year of death, ING versus ${idgtLabel}`}>
        {runs.map((r) => (
          <rect key={r.from} x={clampX(x(r.from) - slot / 2)} y={M.top} width={Math.max(1, clampX(x(r.to) + slot / 2) - clampX(x(r.from) - slot / 2))}
            height={plotBottom - M.top} fill="var(--series-2)" opacity="0.1" />
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)" className="tabular">{fmtMoneyCompact(t)}</text>
          </g>
        ))}
        <line x1={M.left} x2={M.left + plotW} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth="1" />
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={plotBottom + 16} textAnchor="middle" fontSize="11" fill="var(--ink-muted)" className="tabular">{t}</text>
        ))}
        <text x={M.left + plotW / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--ink-2)">{married ? 'second death at end of year' : 'death at end of year'}</text>
        {showDeath && (
          <g>
            <line x1={x(expectedDeathYear)} x2={x(expectedDeathYear)} y1={M.top} y2={plotBottom} stroke="var(--line-strong)" strokeWidth="1" />
            <text x={x(expectedDeathYear)} y={M.top - 7} textAnchor={deathAnchor} fontSize="10" fill="var(--ink-muted)">{married ? 'expected second death' : 'expected death'}</text>
          </g>
        )}
        <path d={path('dHIdgt')} fill="none" stroke={COLOR.IDGT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={path('dH')} fill="none" stroke={COLOR.ING} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {endLabels.map((l) => (
          <g key={l.key}>
            <circle cx={xEnd} cy={l.yLine} r="6" fill="var(--surface)" />
            <circle cx={xEnd} cy={l.yLine} r="4" fill={COLOR[l.key]} />
            {collide && <line x1={xEnd + 6} y1={l.yLine} x2={xEnd + 10} y2={l.yLab} stroke="var(--ink-muted)" strokeWidth="1" />}
            <text x={xEnd + 12} y={l.yLab + 4} fontSize="11" fill="var(--ink-1)" className="tabular">
              <tspan fontWeight="600">{l.name}</tspan> {fmtMoneyCompact(l.v)}
            </text>
          </g>
        ))}
        {hovered && (
          <g>
            <line x1={x(hovered.t)} x2={x(hovered.t)} y1={M.top} y2={plotBottom} stroke="var(--line-strong)" strokeWidth="1" />
            {['dHIdgt', 'dH'].map((k) => (
              <g key={k}>
                <circle cx={x(hovered.t)} cy={y(hovered[k])} r="6" fill="var(--surface)" />
                <circle cx={x(hovered.t)} cy={y(hovered[k])} r="4" fill={k === 'dH' ? COLOR.ING : COLOR.IDGT} />
              </g>
            ))}
          </g>
        )}
        {/* hit targets: one full-height column per death year */}
        {shown.map((r, i) => (
          <rect key={r.t} x={x(r.t) - slot / 2} y={M.top} width={Math.max(slot, 8)} height={plotBottom - M.top} fill="transparent" tabIndex={0}
            onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)}
            aria-label={`Death at end of year ${r.t}, age ${r.age}: ING ${fmtMoney(r.dH)}, ${idgtLabel} ${fmtMoney(r.dHIdgt)}`} />
        ))}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute z-10 w-[184px] rounded-md border border-line bg-surface px-2 py-1 text-xs shadow" style={{ left: tipLeft, top: M.top }}>
          <div className="font-medium text-ink">Death at end of year {hovered.t} · age {hovered.age}</div>
          <div className="text-muted">probability {fmtPct(hovered.q, 2)}</div>
          <div className="tabular flex items-center justify-between gap-2 text-ink-2">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-3" style={{ background: COLOR.ING }} />ING</span>{fmtMoney(hovered.dH)}
          </div>
          <div className="tabular flex items-center justify-between gap-2 text-ink-2">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-3" style={{ background: COLOR.IDGT }} />IDGT</span>{fmtMoney(hovered.dHIdgt)}
          </div>
        </div>
      )}
      {hidden > 0 && (
        <p className="mt-1 text-xs text-muted">{hidden} later year{hidden === 1 ? ' is' : 's are'} hidden by the display horizon.</p>
      )}
      <details className="mt-1 text-xs text-ink-2">
        <summary className="text-muted underline-offset-2 hover:underline">Table view</summary>
        <div className="scroll-x mt-1 max-h-48">
          <table className="tabular w-full text-xs">
            <thead>
              <tr className="text-left text-muted">
                <th className="pr-3 font-normal">Year</th><th className="pr-3 font-normal">Age</th><th className="pr-3 text-right font-normal">q</th>
                <th className="pr-3 text-right font-normal">ING</th><th className="text-right font-normal">{idgtLabel}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.t}>
                  <td className="pr-3">{r.t}</td><td className="pr-3">{r.age}</td><td className="pr-3 text-right">{fmtPct(r.q, 2)}</td>
                  <td className="pr-3 text-right">{fmtMoney(r.dH)}</td><td className="text-right">{fmtMoney(r.dHIdgt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
