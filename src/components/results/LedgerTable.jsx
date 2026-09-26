import { useState } from 'react';
import { fmtMoney, fmtPct } from '../format.js';

const COLS = [
  ['t', 'Year', (r) => r.t],
  ['age', 'Age', (r) => r.age],
  ['q', 'P(death)', (r) => fmtPct(r.q, 2)],
  ['V', 'Asset value', (r) => fmtMoney(r.V)],
  ['T', 'Trust holds', (r) => fmtMoney(r.T)],
  ['Xt', 'Exclusion', (r) => fmtMoney(r.Xt)],
  ['ETb', 'Estate tax · keep', (r) => fmtMoney(r.ETb)],
  ['ETs', 'Estate tax · gift', (r) => fmtMoney(r.ETs)],
  ['SUs', "Heirs' CGT · gift", (r) => fmtMoney(r.SUs)],
  ['Hb', 'Heirs · keep', (r) => fmtMoney(r.Hb)],
  ['Hs', 'Heirs · gift', (r) => fmtMoney(r.Hs)],
  ['dH', 'Δ heir wealth', (r) => fmtMoney(r.dH)],
  ['PV', 'PV of Δ', (r) => fmtMoney(r.PV)],
  ['wPV', 'Weighted PV', (r) => fmtMoney(r.wPV)],
];

/** Per-death-year ledger; the NPV is the sum of the last column. Truncated to the display horizon. */
export default function LedgerTable({ rowsNone, rowsOpt, sStar, maxYears, shareBeyondDisplay }) {
  const [view, setView] = useState(sStar > 0 ? 'opt' : 'none');
  const rows = view === 'opt' ? rowsOpt : rowsNone;
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
      </div>
      <div className="scroll-x max-h-[420px] overflow-y-auto">
        <table className="tabular w-full min-w-[1100px] border-collapse text-xs">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line-strong text-left text-muted">
              {COLS.map(([k, label]) => <th key={k} className={`px-2 py-1.5 font-medium ${k === 't' || k === 'age' ? 'text-left' : 'text-right'}`}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.t} className={`border-b border-line ${r.swapped && r.swapEvent ? 'bg-accent-soft/40' : ''}`}>
                {COLS.map(([k, , get]) => (
                  <td key={k} className={`whitespace-nowrap px-2 py-1 ${k === 't' || k === 'age' ? 'text-left' : 'text-right'} ${(k === 'dH' || k === 'PV' || k === 'wPV') && r[k] < 0 ? 'text-bad' : ''}`}>{get(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Death is valued at the end of each year; the swap (highlighted row) executes at year-end before death. Heirs' CGT is discounted from the sale k years after death.
        {hidden > 0 && ` ${hidden} later year${hidden === 1 ? '' : 's'} hidden by the display horizon; they carry ${fmtPct(shareBeyondDisplay ?? 0, 1)} of the absolute weighted PV and are included in NPV.`}
      </p>
    </div>
  );
}
