import Card from '../ui/Card.jsx';
import WarningsList from './WarningsList.jsx';
import BridgeChart from './BridgeChart.jsx';
import CrossoverChart from './CrossoverChart.jsx';
import BreakevenGrid from './BreakevenGrid.jsx';
import { REASON_ING_ALWAYS, REASON_IDGT_ALWAYS } from '../../engine/breakeven.js';
import { BREAKEVEN_STATE_RATE_MAX } from '../../engine/constants.js';
import { fmtMoney, fmtMoneyCompact, fmtPct, fmtRatio } from '../format.js';

// ING trust versus IDGT for the selected asset (docs/changes/2026-09-27-ing-comparison/model.md §3–§7).
// Every number comes from the engine via props; this file only formats and composes sentences from signs.

function Tile({ label, value, sub, negative, children }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold ${negative ? 'text-bad' : 'text-ink'}`}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
      {children}
    </div>
  );
}

const VERDICT = {
  ING: { text: 'ING is better', color: 'var(--series-2)' },
  IDGT: { text: 'IDGT is better', color: 'var(--series-1)' },
  tie: { text: 'Tie', color: 'var(--ink-muted)' },
};

const COMPUTING = 'Computing (re-runs the full swap search ~100 times)…';
const NOT_EVALUABLE = { value: '—', reading: 'Not evaluable for these inputs.' };
const RATE_MAX = fmtPct(BREAKEVEN_STATE_RATE_MAX, 0);

const crossingsNote = (r, gridShowsIt) => (r.crossings > 1 ? ` First of ${r.crossings} crossings${gridShowsIt ? ' — see the grid' : ''}.` : '');

// Each reading takes its direction from the solver's signs (ingWinsAbove / reason), never from an assumed shape.
const BREAKEVENS = [
  {
    key: 'burnShare',
    label: 'Burn the grantor must bear',
    read: (r) => {
      if (r.value != null) {
        const x = fmtPct(r.value, 1);
        const text = r.ingWinsAbove
          ? `The IDGT beats the ING only while the grantor bears at most ${x} (the other estate out-compounds the asset).`
          : `The IDGT beats the ING only while the grantor bears at least ${x} of the trust's income tax; below that, the ING wins.`;
        return { value: x, reading: text + crossingsNote(r, true) };
      }
      if (r.reason === REASON_IDGT_ALWAYS) return { value: 'None needed', reading: 'The IDGT wins at any burn share — even if the trust pays all its own tax.' };
      if (r.reason === REASON_ING_ALWAYS) return { value: 'Unreachable', reading: 'The ING wins even when the grantor bears 100% of the burn.' };
      return NOT_EVALUABLE;
    },
  },
  {
    key: 'stateRate',
    label: 'Grantor state rate at breakeven',
    read: (r) => {
      if (r.value != null) {
        const x = fmtPct(r.value, 2);
        const text = r.ingWinsAbove
          ? `The ING wins only if the grantor's state income-tax rate is at least ${x}.`
          : `The ING wins only while the grantor's state rate is below ${x}.`;
        return { value: x, reading: text + crossingsNote(r, true) };
      }
      if (r.reason === REASON_IDGT_ALWAYS) return { value: `> ${RATE_MAX}`, reading: `The IDGT wins at every state rate from 0% to ${RATE_MAX}.` };
      if (r.reason === REASON_ING_ALWAYS) return { value: '0%', reading: `The ING wins at every state rate from 0% to ${RATE_MAX}.` };
      return NOT_EVALUABLE;
    },
  },
  {
    key: 'otherEstate',
    label: 'Other estate at breakeven',
    read: (r) => {
      if (r.value != null) {
        const x = fmtMoneyCompact(r.value);
        const text = r.ingWinsAbove
          ? `The ING wins once the other estate exceeds ${x}.`
          : `The ING wins while the other estate is below ${x} (the IDGT's freeze and burn need a taxable estate).`;
        // the grid varies the state rate and burn share, not the estate, so it cannot show these crossings
        return { value: x, reading: text + crossingsNote(r, false) };
      }
      if (r.reason === REASON_IDGT_ALWAYS) return { value: 'No breakeven', reading: 'The IDGT wins at every estate size tested.' };
      if (r.reason === REASON_ING_ALWAYS) return { value: 'No breakeven', reading: 'The ING wins at every estate size tested.' };
      return NOT_EVALUABLE;
    },
  },
];

const DECOMPOSITION = [
  { key: 'locNet', label: 'Location', note: 'the same tax paid from the trust instead of the other estate; not a tax benefit (it depends on the asset out-earning the rest of the estate)' },
  { key: 'ssNet', label: 'State-rate saving', note: "income tax the trust saves versus the grantor's rates, net of the estate tax on the extra wealth" },
  { key: 'feeNet', label: 'Administration cost', note: 'trustee cost, net of estate tax' },
  { key: 'stepUp', label: 'Step-up', note: 'zero unless the interest is included at a discount at death' },
];

function Breakevens({ breakevens, isStale, error }) {
  const loading = !breakevens && !error;
  return (
    <div className={`transition-opacity ${isStale ? 'opacity-70' : ''}`} aria-busy={isStale || loading || undefined}>
      {error ? (
        <div role="alert" className="rounded-md border border-bad/40 bg-bad-soft px-3 py-2 text-sm text-ink">Breakevens could not be computed: {error}</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {BREAKEVENS.map((b) => {
            const r = breakevens?.[b.key];
            const shown = loading || !r ? { value: '…', reading: COMPUTING } : b.read(r);
            return (
              <Tile key={b.key} label={b.label} value={shown.value}>
                <p className="mt-0.5 text-xs text-ink-2">{shown.reading}</p>
              </Tile>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function IngComparison({ entry, breakevens, grid, isStale, error }) {
  if (!entry?.ing || !entry?.result) return null;
  const ing = entry.ing;
  const r = entry.result;
  const vs = ing.vsIdgt;
  const verdict = VERDICT[vs.verdict] ?? VERDICT.tie;

  return (
    <Card title={`ING trust vs IDGT — ${entry.name}`}
      subtitle="Incomplete non-grantor trust: no gift, no exclusion used, trust pays its own income tax, stays in the estate and is stepped up at death — against the IDGT at its best swap year.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="NPV · ING" value={fmtMoneyCompact(ing.npv)} sub={`no exclusion used · ${fmtRatio(ing.npvPerFMV)} of FMV`} negative={ing.npv < 0} />
        <Tile label="NPV · IDGT best swap" value={fmtMoneyCompact(r.npvOpt)}
          sub={`${r.sStar > 0 ? `swap at end of year ${r.sStar}` : 'no swap is best'}${r.effPerFMV ? ` · ${fmtRatio(r.effPerFMV.opt)} of FMV` : ''}`} negative={r.npvOpt < 0} />
        <Tile label="ING minus IDGT" value={fmtMoneyCompact(vs.deltaOpt)} negative={vs.deltaOpt < 0}>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 font-medium text-ink">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: verdict.color }} aria-hidden="true" />{verdict.text}
            </span>
            <span className="text-muted">vs no-swap IDGT: {fmtMoneyCompact(vs.deltaNone)}</span>
          </div>
        </Tile>
      </div>

      {(ing.derived?.stateTaxOnGrantor || ing.derived?.zeroStateRateAssumption) && (
        <p className="mt-3 flex gap-1.5 text-xs text-muted">
          <span aria-hidden="true" className="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line-strong text-[10px] leading-none">i</span>
          <span>
            {ing.derived.stateTaxOnGrantor
              ? "Home state taxes the grantor on the ING's income (N.Y. Tax Law §612(b)(41); Cal. R&TC §17082): the state tax is paid from the other estate, so the ING saves no state tax."
              : "The ING is assumed to bear no state income tax. That holds only for portfolio income and gains in a no-tax situs (NV, WY, SD, AK; DE without resident beneficiaries). Enter a rate if the asset has income sourced to a taxing state, or if the grantor's home state taxes the trust as a resident trust; New York and California grantors: use the home-state switch."}
          </span>
        </p>
      )}

      {ing.warnings?.length > 0 && (
        <div className="mt-4">
          <WarningsList warnings={ing.warnings} />
        </div>
      )}

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-ink">Breakevens</h3>
        <p className="mb-2 text-xs text-muted">Where the verdict flips when one input moves and every other input stays as entered; each trial re-optimises the IDGT's swap year.</p>
        <Breakevens breakevens={breakevens} isStale={isStale} error={error} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">From IDGT to ING — where the difference comes from</h3>
          <p className="mb-2 text-xs text-muted">The IDGT's components are removed one by one down to zero, then the ING's are added; the last bar is the ING's NPV.</p>
          <BridgeChart bridge={vs.bridge} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Heir-wealth gain by year of death</h3>
          <p className="mb-2 text-xs text-muted">What heirs gain over keeping the asset if the grantor dies at the end of each year, undiscounted; shading marks the years the ING leads.</p>
          <CrossoverChart rows={ing.rows} leadYears={vs.ingLeadsYears} expectedDeathYear={r.derived?.expectedDeathYear} sStar={r.sStar} maxYears={entry.inputs?.NDisp} />
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-ink">Breakeven grid — grantor state rate × share of the burn the grantor bears</h3>
        <p className="mb-2 text-xs text-muted">ING minus IDGT for every combination; the heavy line is where the better structure changes.</p>
        {error && !grid
          ? <p className="text-xs text-muted">Not available — the breakeven computation failed (see above).</p>
          : <BreakevenGrid grid={grid} isStale={isStale} />}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">ING decomposition</h3>
          <p className="mb-1 text-xs text-muted">Exact attribution of the ING's NPV; the four components sum to the total.</p>
          <table className="tabular w-full text-xs">
            <thead>
              <tr className="text-left text-muted"><th className="py-1 pr-3 font-normal">Component</th><th className="py-1 text-right font-normal">NPV</th></tr>
            </thead>
            <tbody>
              {DECOMPOSITION.map((d) => (
                <tr key={d.key} className="border-t border-line align-top">
                  <td className="py-1.5 pr-3">
                    <div className="text-ink">{d.label}</div>
                    <div className="text-muted">{d.note}</div>
                  </td>
                  <td className={`py-1.5 text-right whitespace-nowrap ${ing.components[d.key] < 0 ? 'text-bad' : 'text-ink'}`}>{fmtMoney(ing.components[d.key])}</td>
                </tr>
              ))}
              <tr className="border-t border-line-strong font-semibold text-ink">
                <td className="py-1.5 pr-3">Total — NPV of the ING</td>
                <td className={`py-1.5 text-right whitespace-nowrap ${ing.npv < 0 ? 'text-bad' : ''}`}>{fmtMoney(ing.npv)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">How to read</h3>
          <p className="mt-1 text-xs text-muted">
            The ING consumes no exclusion and keeps the §1014 step-up, because the trust stays in the estate; what it gains is the income tax
            it saves at its own rates, less its cost. It also pays its tax out of the trust instead of the other estate: that location line is
            not tax, and it is only as large as the gap you entered between the asset's return and the other estate's growth — check that
            rate before reading the ING's sign. The IDGT removes the asset's growth and the income-tax burn from the estate, but loses the
            step-up unless the asset is swapped back before death. In a taxable estate the IDGT's freeze usually dominates, so the burn-share and
            state-rate breakevens usually exist only when the estate is near or below the exclusion.
          </p>
        </div>
      </div>
    </Card>
  );
}
