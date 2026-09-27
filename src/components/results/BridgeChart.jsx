import { useState } from 'react';
import { useContainerWidth } from './useContainerWidth.js';
import { fmtMoney, fmtMoneyCompact } from '../format.js';

// Waterfall from the IDGT's NPV at its best swap year to the ING's NPV (ING model.md §9 `vsIdgt.bridge`).
// The engine supplies every level (`from`/`to`); this component only positions and labels them.

const STEP_LABELS = {
  IDGT: { freeze: 'Freeze', burn: 'Tax burn', giftTax: 'Gift tax', resid: 'Residual', stepUp: 'Step-up (IDGT)' },
  ING: { locNet: 'Location', ssNet: 'State-rate saving', feeNet: 'Admin cost', stepUp: 'Step-up (ING)' },
};
const COLOR = { IDGT: 'var(--series-1)', ING: 'var(--series-2)' };
const STEP_OPACITY = 0.55; // component bars read as 'removed' / 'added' against the solid totals
const BAR = 14;
const BAND = 26; // row pitch = hit-target height (≥ 24px)
const RADIUS = 4;
const M = { top: 6, right: 8, bottom: 24 };
const VALUE_LABEL = 56; // px reserved beyond each extreme for the value labels

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

/** Horizontal bar between two x positions; `roundLeft`/`roundRight` give that end a 4px rounded data-end. */
function barPath(xa, xb, y, h, roundLeft, roundRight) {
  const x1 = Math.min(xa, xb);
  const w = Math.max(Math.abs(xb - xa), 1);
  const x2 = x1 + w;
  const r = Math.min(RADIUS, w / 2, h / 2);
  const rl = roundLeft ? r : 0;
  const rr = roundRight ? r : 0;
  return [
    `M${x1 + rl},${y}`, `H${x2 - rr}`, rr ? `A${rr},${rr} 0 0 1 ${x2},${y + rr}` : '', `V${y + h - rr}`,
    rr ? `A${rr},${rr} 0 0 1 ${x2 - rr},${y + h}` : '', `H${x1 + rl}`, rl ? `A${rl},${rl} 0 0 1 ${x1},${y + h - rl}` : '',
    `V${y + rl}`, rl ? `A${rl},${rl} 0 0 1 ${x1 + rl},${y}` : '', 'Z',
  ].join(' ');
}

const signedCompact = (v) => (v > 0 ? `+${fmtMoneyCompact(v)}` : fmtMoneyCompact(v));

/**
 * @param {{ bridge: { start: number, sStar: number, steps: { key: string, side: 'IDGT'|'ING', value: number, from: number, to: number }[], end: number } }} props
 */
export default function BridgeChart({ bridge }) {
  const [ref, width] = useContainerWidth();
  const [hover, setHover] = useState(null);
  if (!bridge?.steps?.length) return null;
  const { start, sStar, steps, end } = bridge;

  const items = [
    { id: 'start', label: sStar > 0 ? `IDGT (swap yr ${sStar})` : 'IDGT (no swap)', side: 'IDGT', total: true, value: start, from: 0, to: start },
    ...steps.map((s) => ({ id: `${s.side}-${s.key}`, label: STEP_LABELS[s.side]?.[s.key] ?? s.key, side: s.side, total: false, value: s.value, from: s.from, to: s.to })),
    { id: 'end', label: 'ING', side: 'ING', total: true, value: end, from: 0, to: end },
  ];
  // Direct labels: the two totals and the two largest steps (by size); every other value is in the tooltip and table.
  const labelled = new Set(
    [...items.filter((it) => !it.total && Math.abs(it.value) >= 0.5)]
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 2)
      .map((it) => it.id),
  );

  const W = Math.max(width, 240);
  const labelW = 124; // row labels (fits "IDGT (swap yr 99)" in 11px semibold)
  const levels = items.flatMap((it) => [it.from, it.to]);
  const minV = Math.min(0, ...levels);
  const maxV = Math.max(0, ...levels);
  const span = Math.max(1, maxV - minV);
  const plotW = Math.max(80, W - labelW - M.right);
  const scale = Math.max(20, plotW - 2 * VALUE_LABEL) / span;
  const x = (v) => labelW + VALUE_LABEL + (v - minV) * scale;
  const H = M.top + items.length * BAND + M.bottom;
  const plotBottom = H - M.bottom;
  const barY = (i) => M.top + i * BAND + (BAND - BAR) / 2;
  const ticks = niceTicks(minV, maxV, Math.max(2, Math.min(5, Math.floor((plotW - 2 * VALUE_LABEL) / 70))));
  const hovered = hover != null ? items[hover] : null;

  const tooltipStyle = () => {
    const it = hovered;
    const mid = (x(it.from) + x(it.to)) / 2;
    const top = hover < items.length / 2 ? M.top + (hover + 1) * BAND + 20 : M.top + hover * BAND - 44;
    return mid > labelW + plotW / 2 ? { left: labelW, top } : { right: M.right, top };
  };

  return (
    <div ref={ref} className="relative">
      <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR.IDGT, opacity: STEP_OPACITY }} />IDGT components (removed)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR.ING, opacity: STEP_OPACITY }} />ING components (added)
        </span>
        <span className="text-muted">solid bars: the two NPVs</span>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bridge from the IDGT's NPV at its best swap year to the ING's NPV">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={M.top} y2={plotBottom} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth="1" />
            <text x={x(t)} y={plotBottom + 15} textAnchor="middle" fontSize="11" fill="var(--ink-muted)" className="tabular">{fmtMoneyCompact(t)}</text>
          </g>
        ))}
        {/* zero line, always drawn even when 0 is not a tick */}
        <line x1={x(0)} x2={x(0)} y1={M.top} y2={plotBottom} stroke="var(--axis)" strokeWidth="1" />
        {hovered && <rect x={0} y={M.top + hover * BAND} width={W} height={BAND} fill="var(--surface-2)" />}
        {/* connectors: a hairline from each bar's end level to the next bar */}
        {items.slice(0, -1).map((it, i) => (
          <line key={`c-${it.id}`} x1={x(it.to)} x2={x(it.to)} y1={barY(i) + BAR} y2={barY(i + 1)} stroke="var(--axis)" strokeWidth="1" />
        ))}
        {items.map((it, i) => {
          const y = barY(i);
          const xa = x(it.from);
          const xb = x(it.to);
          const goesRight = it.to >= it.from;
          const roundLeft = it.total ? !goesRight : true; // totals: square at the zero baseline, rounded at the tip
          const roundRight = it.total ? goesRight : true;
          const showValue = it.total || labelled.has(it.id);
          return (
            <g key={it.id}>
              <text x={labelW - 8} y={y + BAR - 3} textAnchor="end" fontSize="11" fontWeight={it.total ? 600 : 400} fill={it.total ? 'var(--ink-1)' : 'var(--ink-2)'}>{it.label}</text>
              <path d={barPath(xa, xb, y, BAR, roundLeft, roundRight)} fill={COLOR[it.side]} opacity={it.total ? 1 : STEP_OPACITY} />
              {showValue && (
                <text x={goesRight ? Math.max(xa, xb) + 6 : Math.min(xa, xb) - 6} y={y + BAR - 3} textAnchor={goesRight ? 'start' : 'end'}
                  fontSize="11" fontWeight={it.total ? 600 : 400} fill={it.total ? 'var(--ink-1)' : 'var(--ink-2)'} className="tabular"
                  stroke="var(--surface)" strokeWidth="3" strokeLinejoin="round" paintOrder="stroke">
                  {it.total ? fmtMoneyCompact(it.value) : signedCompact(it.value)}
                </text>
              )}
            </g>
          );
        })}
        {/* hit targets: one full-width row per bar */}
        {items.map((it, i) => (
          <rect key={`h-${it.id}`} x={0} y={M.top + i * BAND} width={W} height={BAND} fill="transparent" tabIndex={0}
            onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)}
            aria-label={it.total
              ? `${it.label}: NPV ${fmtMoney(it.value)}`
              : `${it.label} (${it.side} component ${it.side === 'IDGT' ? 'removed' : 'added'}): ${fmtMoney(it.value)}, from ${fmtMoney(it.from)} to ${fmtMoney(it.to)}`} />
        ))}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute z-10 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow" style={tooltipStyle()}>
          <div className="flex items-center gap-1.5 font-medium text-ink">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: COLOR[hovered.side], opacity: hovered.total ? 1 : STEP_OPACITY }} />
            {hovered.label}
            <span className="font-normal text-muted">{hovered.total ? 'NPV' : hovered.side === 'IDGT' ? 'IDGT component removed' : 'ING component added'}</span>
          </div>
          <div className="tabular text-ink-2">{hovered.total ? fmtMoney(hovered.value) : `${hovered.value > 0 ? '+' : ''}${fmtMoney(hovered.value)}`}</div>
          {!hovered.total && <div className="tabular text-muted">{fmtMoney(hovered.from)} → {fmtMoney(hovered.to)}</div>}
        </div>
      )}
      <details className="mt-1 text-xs text-ink-2">
        <summary className="text-muted underline-offset-2 hover:underline">Table view</summary>
        <table className="tabular mt-1 w-full text-xs">
          <thead><tr className="text-left text-muted"><th className="pr-3 font-normal">Item</th><th className="pr-3 text-right font-normal">Change</th><th className="text-right font-normal">Level after</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className={it.total ? 'font-semibold text-ink' : ''}>
                <td className="pr-3">{it.total ? `${it.label} NPV` : `${it.label} (${it.side === 'IDGT' ? 'removed' : 'added'})`}</td>
                <td className="pr-3 text-right">{it.total ? '' : fmtMoney(it.value)}</td>
                <td className="text-right">{fmtMoney(it.to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
