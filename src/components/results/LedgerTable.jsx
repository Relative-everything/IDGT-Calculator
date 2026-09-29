import { useState } from 'react';
import { fmtMoney, fmtPct } from '../format.js';

// Column labels per scenario; the ING rows alias T/ETs/SUs/Hs to the ING's values (engine/ingModel.js).
const COLS = [
  ['t', 'Year', (r) => r.t],
  ['age', { single: 'Age', married: 'Ages' }, (r) => (r.ageSpouse != null ? `${r.age} / ${r.ageSpouse}` : r.age)],
  ['q', { single: 'P(death)', married: 'P(2nd death)' }, (r) => fmtPct(r.q, 2)],
  ['V', 'Asset value · keep', (r) => fmtMoney(r.V)],
  ['T', { gift: 'Trust holds', ing: 'ING trust holds' }, (r) => fmtMoney(r.T)],
  ['Xt', { single: 'Exclusion', married: 'Basic exclusion' }, (r) => fmtMoney(r.Xt)],
  // married only: the first spouse's unused exclusion ported to the survivor (expected, given the second death that year)
  ['dsue', { gift: 'DSUE ported · keep / gift', ing: 'DSUE ported' }, (r) => (r.dsue != null ? fmtMoney(r.dsue) : `${fmtMoney(r.dsueHold)} / ${fmtMoney(r.dsueGift)}`), 'married'],
  ['ETb', 'Estate tax · keep', (r) => fmtMoney(r.ETb)],
  ['ETs', { gift: 'Estate tax · gift', ing: 'Estate tax · ING' }, (r) => fmtMoney(r.ETs)],
  ['SUs', { gift: "Heirs' CGT · gift", ing: "Heirs' CGT · ING" }, (r) => fmtMoney(r.SUs)],
  ['Hb', 'Heirs · keep', (r) => fmtMoney(r.Hb)],
  ['Hs', { gift: 'Heirs · gift', ing: 'Heirs · ING' }, (r) => fmtMoney(r.Hs)],
  ['dH', 'Δ heir wealth', (r) => fmtMoney(r.dH)],
  ['PV', 'PV of Δ', (r) => fmtMoney(r.PV)],
  ['wPV', 'Weighted PV', (r) => fmtMoney(r.wPV)],
];
const labelFor = (label, view, married) => {
  if (typeof label === 'string') return label;
  if ('single' in label) return married ? label.married : label.single;
  return label[view === 'ing' ? 'ing' : 'gift'];
};

/** Per-death-year ledger; the NPV is the sum of the last column. Truncated to the display horizon. */
export default function LedgerTable({ rowsNone, rowsOpt, rowsIng, sStar, maxYears, shareBeyondDisplay, married }) {
  const [view, setView] = useState(sStar > 0 ? 'opt' : 'none');
  const cols = COLS.filter(([, , , only]) => only !== 'married' || married);
  const rows = view === 'opt' ? rowsOpt : view === 'ing' && rowsIng ? rowsIng : rowsNone;
  const shown = rows.slice(0, Number.isInteger(maxYears) && maxYears > 0 ? maxYears : rows.length);
  const hidden = rows.length - shown.length;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Scenario:</span>
        <button type="button" onClick={() => setView('none')} className={`rounded px-2 py-0.5 ${view === 'none' ? 'bg-accent text-accent-ink' : 'border border-line-strong text-ink-2'}`}>No swap</button>
        <button type="button" onClick={() => setView('opt')} disabled={!(sStar > 0)} className={`rounded px-2 py-0.5 ${view === 'opt' ? 'bg-accent text-accent-ink' : 'border border-line-strong text-ink-2'} disabled:opacity-40`}>
          {sStar > 0 ? `Swap in year ${sStar}` : 'Swap (none is best)'}
        </button>
        {rowsIng && (
          <button type="button" onClick={() => setView('ing')} className={`rounded px-2 py-0.5 ${view === 'ing' ? 'bg-accent text-accent-ink' : 'border border-line-strong text-ink-2'}`}>ING trust</button>
        )}
      </div>
      <div className="scroll-x max-h-[420px] overflow-y-auto">
        <table className={`tabular w-full ${married ? 'min-w-[1240px]' : 'min-w-[1100px]'} border-collapse text-xs`}>
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line-strong text-left text-muted">
              {cols.map(([k, label]) => <th key={k} className={`px-2 py-1.5 font-medium ${k === 't' || k === 'age' ? 'text-left' : 'text-right'}`}>{labelFor(label, view, married)}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.t} className={`border-b border-line ${r.swapped && r.swapEvent ? 'bg-accent-soft/40' : ''}`}>
                {cols.map(([k, , get]) => (
                  <td key={k} className={`whitespace-nowrap px-2 py-1 ${k === 't' || k === 'age' ? 'text-left' : 'text-right'} ${(k === 'dH' || k === 'PV' || k === 'wPV') && r[k] < 0 ? 'text-bad' : ''}`}>{get(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        {married
          ? "Each row is the expected outcome if the second death falls at the end of that year, averaged over which spouse dies first and when (grantor's and spouse's ages shown). The survivor's exclusion is the basic exclusion of that year plus the DSUE ported at the first death; the gift lowers the grantor's DSUE by the exclusion it used. The swap can only happen while the grantor lives; heirs' CGT is discounted from the sale k years after the second death."
          : "Death is valued at the end of each year; the swap (highlighted row) executes at year-end before death. Heirs' CGT is discounted from the sale k years after death."}
        {view === 'ing' && ' ING view: the trust pays its own income tax and costs, stays in the estate and is stepped up at death; Δ is ING minus keep.'}
        {hidden > 0 && (view === 'ing'
          ? ` ${hidden} later year${hidden === 1 ? '' : 's'} hidden by the display horizon; they are included in NPV.`
          : ` ${hidden} later year${hidden === 1 ? '' : 's'} hidden by the display horizon; they carry ${fmtPct(shareBeyondDisplay ?? 0, 1)} of the absolute weighted PV and are included in NPV.`)}
      </p>
    </div>
  );
}
