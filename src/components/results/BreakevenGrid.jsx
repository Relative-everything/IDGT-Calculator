import { fmtMoney, fmtMoneyCompact, fmtPct } from '../format.js';

// Heatmap of Δ_opt = NPV(ING) − NPV(IDGT at its optimal swap year) over the grantor's state rate (columns) and the
// share of the burn the grantor bears (rows), as returned by comparisonGrid (ING model.md §7). Display only: the
// colour scale is |Δ| relative to the largest |Δ| in the grid, the side of the diverging scale is the engine's verdict.

const ARM = { ING: 'var(--series-2)', IDGT: 'var(--series-1)' };
// Four steps per arm, mixed toward the neutral midpoint. var(--ink-1) text clears ≥ 5:1 on every step in both themes.
const STEPS = [
  { upTo: 0.1, mix: 18 },
  { upTo: 0.3, mix: 38 },
  { upTo: 0.6, mix: 58 },
  { upTo: 1, mix: 78 },
];
const NEUTRAL = 'var(--surface-2)';
const GAP = '2px solid var(--surface)';
const FRONTIER = '2px solid var(--ink-1)';

const stepFill = (side, mix) => `color-mix(in oklab, ${ARM[side]} ${mix}%, ${NEUTRAL})`;

/** Percentage with only the decimals the value needs (lattice points are whole percentages; own values may not be). */
function fmtRate(v) {
  const pct = v * 100;
  const digits = [0, 1].find((d) => Math.abs(pct - Number(pct.toFixed(d))) < 1e-9) ?? 2;
  return fmtPct(v, digits);
}

function Ramp({ side, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {STEPS.map((s) => <span key={s.mix} className="inline-block h-3 w-3 rounded-sm" style={{ background: stepFill(side, s.mix) }} />)}
      </span>
    </span>
  );
}

/**
 * @param {{ grid: { stateRates: number[], burnShares: number[], cells: (number|null)[][], verdicts: (string|null)[][],
 *   own: { row: number, col: number, rowInserted: boolean, colInserted: boolean, asEntered: boolean } } | null, isStale?: boolean }} props
 */
export default function BreakevenGrid({ grid, isStale }) {
  if (!grid) return <p className="text-xs text-muted">Computing…</p>;
  const { stateRates, burnShares, cells, verdicts, own } = grid;
  const maxAbs = Math.max(0, ...cells.flat().filter((v) => v != null && Number.isFinite(v)).map((v) => Math.abs(v)));

  const fillFor = (v, verdict) => {
    if (v == null || !ARM[verdict] || maxAbs === 0) return NEUTRAL;
    const ratio = Math.abs(v) / maxAbs;
    const step = STEPS.find((s) => ratio <= s.upTo + 1e-12) ?? STEPS[STEPS.length - 1];
    return stepFill(verdict, step.mix);
  };
  const describe = (i, j) => {
    const v = cells[i][j];
    const verdict = verdicts[i][j];
    const where = `State ${fmtRate(stateRates[j])}, grantor bears ${fmtRate(burnShares[i])}`;
    if (v == null) return `${where}: not evaluable for these inputs`;
    if (verdict === 'ING' || verdict === 'IDGT') return `${where}: ${verdict} better by ${fmtMoney(Math.abs(v))}`;
    return `${where}: tie (ING minus IDGT ${fmtMoney(v)})`;
  };
  const differs = (a, b) => a != null && b != null && a !== b;

  return (
    <div className={`transition-opacity ${isStale ? 'opacity-70' : ''}`} aria-busy={isStale || undefined}>
      <div className="scroll-x">
        <table className="tabular text-[11px]">
          <caption className="sr-only">
            ING minus IDGT at the IDGT's optimal swap year, by the grantor's state income-tax rate (columns) and the share of the trust's income tax the grantor bears (rows)
          </caption>
          <thead>
            <tr>
              <th rowSpan={2} scope="col" className="sticky left-0 z-10 w-24 min-w-24 bg-surface px-1.5 py-1 text-left align-bottom font-normal leading-tight whitespace-normal text-ink-2"
                style={{ border: GAP }}>
                Share of the trust's income tax the grantor bears ↓
              </th>
              <th colSpan={stateRates.length} scope="colgroup" className="px-1.5 py-1 text-left font-normal text-ink-2" style={{ border: GAP }}>
                Grantor's state income-tax rate →
              </th>
            </tr>
            <tr>
              {stateRates.map((rate, j) => (
                <th key={rate} scope="col" className="px-1.5 py-1 text-center font-medium whitespace-nowrap text-ink" style={{ border: GAP }}>
                  {fmtRate(rate)}
                  {own.colInserted && j === own.col && <span className="ml-0.5 font-normal text-muted">(yours)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {burnShares.map((share, i) => (
              <tr key={share}>
                <th scope="row" className="sticky left-0 z-10 bg-surface px-1.5 py-1 text-right font-medium whitespace-nowrap text-ink" style={{ border: GAP }}>
                  {fmtRate(share)}
                  {own.rowInserted && i === own.row && <span className="ml-0.5 font-normal text-muted">(yours)</span>}
                </th>
                {stateRates.map((rate, j) => {
                  const v = cells[i][j];
                  const isOwn = i === own.row && j === own.col;
                  const label = describe(i, j);
                  return (
                    <td key={rate} tabIndex={0} title={label} aria-label={isOwn ? `${label} (your inputs)` : label}
                      className={`px-1.5 py-1 text-center whitespace-nowrap text-ink focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent ${isOwn ? 'font-semibold' : ''}`}
                      style={{
                        background: fillFor(v, verdicts[i][j]),
                        borderTop: GAP,
                        borderLeft: GAP,
                        // frontier on the right/bottom side where the verdict changes; in the collapsed model the
                        // left/top cell's border wins a same-width conflict, so the line is drawn exactly once
                        borderRight: differs(verdicts[i][j], verdicts[i][j + 1]) ? FRONTIER : GAP,
                        borderBottom: differs(verdicts[i][j], verdicts[i + 1]?.[j]) ? FRONTIER : GAP,
                        ...(isOwn ? { outline: '2px solid var(--ink-1)', outlineOffset: -3 } : null),
                      }}>
                      {v == null ? '—' : fmtMoneyCompact(v)}
                      {isOwn && <span className="block text-[9px] leading-none font-normal">you</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-ink-2">
        <Ramp side="ING" label="ING wins by more →" />
        <Ramp side="IDGT" label="IDGT wins by more →" />
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: NEUTRAL, boxShadow: 'inset 0 0 0 1px var(--line)' }} aria-hidden="true" />tie or not evaluable
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5" style={{ background: 'var(--ink-1)' }} aria-hidden="true" />frontier: the heavy line separates the two regions
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm" style={{ outline: '2px solid var(--ink-1)', outlineOffset: -2 }} aria-hidden="true" />your inputs
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Each cell is ING minus IDGT, the IDGT at its optimal swap year re-optimised for that cell: positive means the ING leaves heirs more.
        Shades step at 10%, 30%, 60% and 100% of the largest difference in the grid ({fmtMoneyCompact(maxAbs)}).
      </p>
      {own.asEntered && (
        <p className="mt-1 text-xs text-muted">
          Your column ({fmtRate(stateRates[own.col])}) uses the ordinary and capital-gain state rates as entered — they differ, so it is keyed by the
          ordinary rate; every other column applies its rate to both.
        </p>
      )}
    </div>
  );
}
