import { bare } from '../../hooks/inputRegister.js';
import { fmtMoney } from '../format.js';

const TOTALS = [
  ['Σ Fair market value', 'FMV', 'D'],
  ['Σ Cost basis', 'B0', 'E'],
  ['Σ Annual exclusions', 'annualExclusions', 'G'],
  ['Σ Unrealized gain', 'unrealizedGain', 'M'],
  ['Σ Gift value after discount', 'giftValue', 'N'],
  ['Σ Taxable gift', 'taxableGift', 'O'],
  ['Σ Valuation discount', 'discountAmount', null],
];

function Figure({ value, kind = 'money' }) {
  return (
    <span className="flex flex-wrap items-baseline justify-end gap-x-2">
      <span className="tabular font-mono text-[13px] text-ink">{bare(value, kind)}</span>
      <span className="tabular text-xs text-muted">{fmtMoney(value)}</span>
    </span>
  );
}

// The typed columns, whose totals follow the view: as typed, or to the cent as the model reads them.
const TYPED_COLUMNS = new Set(['FMV', 'B0', 'annualExclusions']);

/**
 * Batch control totals and the balance-sheet tie-out; bare figures first (to match a SUM cell), formatted beside. In the
 * "as typed" view the typed columns total as typed, like the register's totals row.
 */
export default function ControlTotals({ totals, typedTotals, mode, tieOut, tieOutTyped }) {
  const asTyped = (key) => mode === 'typed' && TYPED_COLUMNS.has(key) && typedTotals;
  // the tie-out uses the same Σ FMV as the totals beside it: as typed in the typed view, to the cent otherwise
  const tie = mode === 'typed' && tieOutTyped ? tieOutTyped : tieOut;
  const tieKind = mode === 'typed' && tieOutTyped ? 'typedSum' : 'money';
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold text-ink">Batch control totals</h3>
        <p className="mt-0.5 text-xs text-muted">
          Compare with the column totals of the source. The letter is the asset-register column.
          {mode === 'typed' ? ' Typed columns total as typed; derived columns foot the cents shown on each row.' : ' Money totals foot the cents shown on each row.'}
        </p>
        <dl className="mt-2 divide-y divide-line rounded-md border border-line text-[13px]">
          <div className="flex items-baseline justify-between gap-3 px-3 py-1.5">
            <dt className="text-ink-2">Assets (record count)</dt>
            <dd className="tabular font-mono text-ink">{totals.count}</dd>
          </div>
          {TOTALS.map(([text, key, col]) => (
            <div key={key} className="grid grid-cols-[1fr_auto] items-baseline gap-3 px-3 py-1.5">
              <dt className="text-ink-2">{text}{col && <span className="ml-1.5 font-mono text-[11px] text-muted">col {col}</span>}
                {totals[key].skipped > 0 && <span className="block text-xs text-bad">{totals[key].skipped} value{totals[key].skipped === 1 ? '' : 's'} not a number, left out of this total</span>}
              </dt>
              <dd>{asTyped(key) ? <Figure value={typedTotals[key].sum} kind="typedSum" /> : <Figure value={totals[key].sum} />}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-ink">Balance-sheet tie-out</h3>
        <p className="mt-0.5 text-xs text-muted">Compare the total with the client's net worth on the balance sheet (e.g. the eMoney net-worth report).</p>
        <dl className="mt-2 divide-y divide-line rounded-md border border-line text-[13px]">
          <div className="grid grid-cols-[1fr_auto] items-baseline gap-3 px-3 py-1.5"><dt className="text-ink-2">Other estate (as entered)</dt><dd><Figure value={tie.otherEstate} kind={tieKind} /></dd></div>
          <div className="grid grid-cols-[1fr_auto] items-baseline gap-3 px-3 py-1.5">
            <dt className="text-ink-2">+ Σ candidate assets at FMV
              {tie.candidatesSkipped > 0 && <span className="block text-xs text-bad">{tie.candidatesSkipped} value{tie.candidatesSkipped === 1 ? '' : 's'} not a number, left out of this total</span>}
            </dt>
            <dd><Figure value={tie.candidates} kind={tieKind} /></dd>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-baseline gap-3 bg-surface-2 px-3 py-1.5 font-medium"><dt className="text-ink">= Total to compare with net worth</dt><dd><Figure value={tie.total} kind={tieKind} /></dd></div>
        </dl>
        <p className="mt-2 text-xs text-ink-2">
          Each asset is priced against the other estate plus that asset alone. The other estate also pays the grantor's
          income tax on the trust's income, any gift tax and the swap consideration. If it already includes the
          candidates, this total double-counts them. If it leaves them all out, each asset's run ignores the others:
          results move when the estate is near the exclusion, and at any estate size a swap can look unaffordable that
          the whole estate could pay for.
        </p>
      </div>
    </div>
  );
}
