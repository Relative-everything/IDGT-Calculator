import Card from '../ui/Card.jsx';
import SwapCurveChart from './SwapCurveChart.jsx';
import DecompositionChart from './DecompositionChart.jsx';
import LedgerTable from './LedgerTable.jsx';
import WarningsList from './WarningsList.jsx';
import { fmtMoney, fmtMoneyCompact, fmtRatio, fmtDecimal } from '../format.js';
// NPV per $ of FMV is exported in the CSV; the tiles show the ranking metric (per $ of taxable gift).

function Tile({ label, value, sub, negative }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold ${negative ? 'text-bad' : 'text-ink'}`}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default function AssetDetail({ entry }) {
  if (!entry?.result) return null;
  const r = entry.result;
  const d = r.derived;
  const allSwapYearsFeasible = r.npvCurve.slice(1).every((c) => c.feasible);
  return (
    <Card title={`Detail — ${entry.name}`}
      subtitle={`Taxable gift ${fmtMoney(d.Ug)} · exclusion used ${fmtMoney(d.Uc)}${d.G > 0 ? ` · gift tax paid ${fmtMoney(d.G)} (trust basis ${fmtMoney(d.BT0)})` : ''} · expected death in year ${fmtDecimal(d.expectedDeathYear, 1)}`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="NPV · best swap year" value={fmtMoneyCompact(r.npvOpt)} sub={r.sStar > 0 ? `swap at end of year ${r.sStar}` : 'no swap is best'} negative={r.npvOpt < 0} />
        <Tile label="NPV · no swap" value={fmtMoneyCompact(r.npvNone)} sub="probability-weighted, discounted" negative={r.npvNone < 0} />
        <Tile label="NPV per $ of taxable gift" value={fmtRatio(r.eff.opt)} sub={`no swap ${fmtRatio(r.eff.none)}`} negative={r.eff.opt < 0} />
        <Tile label={allSwapYearsFeasible ? 'Deathbed-swap bound' : 'Deathbed-swap value'} value={fmtMoneyCompact(r.npvPF)}
          sub={allSwapYearsFeasible ? 'upper bound: swap always precedes death' : 'swap in the death year where feasible; not a bound here'} negative={r.npvPF < 0} />
        <Tile label="Per $ of gift tax" value={d.G > 0 ? fmtRatio(r.effPerGiftTax.opt) : '—'} sub={d.G > 0 ? 'exclusion exhausted' : 'no gift tax paid'} negative={r.effPerGiftTax.opt < 0} />
      </div>

      <div className="mt-4">
        <WarningsList warnings={r.warnings} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">NPV by swap year</h3>
          <p className="mb-2 text-xs text-muted">Each point re-runs the whole ledger with the asset swapped back at the end of that year. Dots on the baseline mark years a swap is not feasible.</p>
          <SwapCurveChart curve={r.npvCurve} sStar={r.sStar} npvNone={r.npvNone} expectedDeathYear={d.expectedDeathYear} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Where the NPV comes from</h3>
          <p className="mb-2 text-xs text-muted">Exact attribution of the heir-wealth difference; the five components sum to the total in every year.</p>
          <DecompositionChart none={r.components.none} opt={r.components.opt} npvNone={r.npvNone} npvOpt={r.npvOpt} sStar={r.sStar} />
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-ink">Per-death-year ledger</h3>
        <p className="mb-2 text-xs text-muted">What heirs receive if the grantor dies at the end of each year, keeping the asset versus having gifted it (or placed it in the ING trust).</p>
        <LedgerTable rowsNone={r.rows.none} rowsOpt={r.rows.opt} rowsIng={entry.ing?.rows} sStar={r.sStar} maxYears={entry.inputs?.NDisp} shareBeyondDisplay={r.shareBeyondDisplay} />
      </div>
    </Card>
  );
}
