import { useState } from 'react';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import AuditFlags from './AuditFlags.jsx';
import ControlTotals from './ControlTotals.jsx';
import AssetRegister from './AssetRegister.jsx';
import HouseholdRegister from './HouseholdRegister.jsx';
import { matchesFilter } from '../../hooks/inputRegister.js';

const MODES = [
  { value: 'typed', label: 'As typed', hint: 'exactly what was entered — compare with printed schedules and eMoney screens' },
  { value: 'model', label: 'Model values', hint: 'what the calculation uses, percentages as decimals — compare with Excel cells' },
];
const FILTERS = [{ value: 'all', label: 'All rows' }, { value: 'unverified', label: 'Not yet verified' }, { value: 'flagged', label: 'Flagged' }];

function Progress({ progress }) {
  const share = progress.total ? progress.verified / progress.total : 0;
  return (
    <div className="min-w-[12rem]">
      <div className="text-right text-sm text-ink-2"><strong className="tabular text-ink">{progress.verified}</strong> of <span className="tabular">{progress.total}</span> rows verified</div>
      {progress.hidden > 0 && (
        <div className="text-right text-xs text-muted" title="Ticks on rows that changed after they were ticked, or that are no longer used by the model. They return if the change is undone, and are not saved with Export JSON.">
          {progress.hidden} tick{progress.hidden === 1 ? '' : 's'} hidden: row changed or no longer in use
        </div>
      )}
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.verified} aria-label="Rows verified">
        <div className="h-full rounded-full bg-good" style={{ width: `${Math.round(share * 1000) / 10}%` }} />
      </div>
    </div>
  );
}

/**
 * The inputs audit page: every input as bare data with its reference, the batch control totals, data-entry flags and a
 * tick per row. The register comes from the hook (inputRegister.js); this page only lays it out.
 */
export default function InputsAudit({ register, mode, onModeChange, filter, onFilterChange, reviewer, onReviewerChange, onTick, onClearTicks, onCopy, onDownload, onPrint, printedOn, wide, onWideChange, isStale, banner }) {
  // The Clear ticks confirmation is armed for the tick set it was shown for: any tick change disarms it.
  const tickState = `${register.progress.verified}:${register.progress.hidden}`;
  const [armedFor, setArmedFor] = useState(null);
  const modeHint = MODES.find((m) => m.value === mode)?.hint;
  const anyTicks = register.progress.verified + register.progress.hidden > 0;
  const confirmClear = anyTicks && armedFor === tickState;
  const shownAssets = register.assets.filter((r) => matchesFilter(r, filter)).length;
  const shownHousehold = register.household.filter((r) => matchesFilter(r, filter)).length;
  const filterText = FILTERS.find((f) => f.value === filter)?.label.toLowerCase();
  return (
    <div className={`print-landscape space-y-5 transition-opacity ${isStale ? 'opacity-70' : ''}`} aria-busy={isStale || undefined}>
      {banner}
      <div className="hidden text-xs text-ink-2 print:block">
        IDGT Asset Analyzer · inputs audit · printed {printedOn}{reviewer ? ` · reviewer ${reviewer}` : ''} · values {mode === 'typed' ? 'as typed' : 'as the model reads them'}
        {filter !== 'all' && (
          <strong className="block text-ink">
            Filtered: {filterText} rows only ({shownAssets} of {register.assets.length} asset rows, {shownHousehold} of {register.household.length} other inputs shown). The totals cover every asset.
          </strong>
        )}
      </div>
      <Card title="Inputs audit" subtitle="Every input as bare data, for checking against the source documents. Tick a row when it matches. A tick stays with its row and is hidden as soon as anything in that row changes (it returns if the change is undone); only live ticks are saved with Export JSON." aside={<Progress progress={register.progress} />}>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 print:hidden">
          <div>
            <span className="block text-xs font-medium text-ink-2">Show values</span>
            <div className="mt-1 inline-flex rounded-md border border-line-strong p-0.5" role="group" aria-label="Show values">
              {MODES.map((m) => (
                <button key={m.value} type="button" aria-pressed={mode === m.value} onClick={() => onModeChange(m.value)}
                  className={`rounded px-2.5 py-1 text-sm ${mode === m.value ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-surface-2'}`}>{m.label}</button>
              ))}
            </div>
          </div>
          <label htmlFor="auditFilter" className="block text-xs font-medium text-ink-2">
            Rows
            <select id="auditFilter" value={filter} onChange={(e) => onFilterChange(e.target.value)}
              className="mt-1 block rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none">
              {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          <label htmlFor="auditReviewer" className="block text-xs font-medium text-ink-2">
            Reviewer
            <input id="auditReviewer" value={reviewer} onChange={(e) => onReviewerChange(e.target.value)} placeholder="Initials" maxLength={80}
              className="mt-1 block w-28 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onCopy} title="Tab-separated, same columns as the CSV: paste next to the source sheet">Copy asset table</Button>
            <Button onClick={onDownload} title="Asset register, control totals and every other input in one CSV">Download audit CSV</Button>
            <Button onClick={onPrint}>Print</Button>
            <Button variant="ghost" onClick={() => onWideChange(!wide)} title={wide ? 'Show the input panels again to edit values' : 'Hide the input panels so the register shows more columns'}>
              {wide ? 'Show input panels' : 'Full width'}
            </Button>
            {confirmClear
              ? (
                <>
                  <Button variant="danger" onClick={() => { onClearTicks(); setArmedFor(null); }}>Confirm: clear all ticks</Button>
                  <Button variant="ghost" onClick={() => setArmedFor(null)}>Cancel</Button>
                </>
              )
              : <Button variant="ghost" onClick={() => setArmedFor(tickState)} disabled={!anyTicks} title="Removes every tick, including hidden ones">Clear ticks</Button>}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted print:hidden">
          Showing values {modeHint}. Excel stores 7% as 0.07, so an Excel cell formatted as a percentage matches the model value.
          Ticks, the reviewer and source references are saved with Export JSON.
        </p>
      </Card>

      <AuditFlags flags={register.flags} />

      <Card title="Control totals">
        <ControlTotals totals={register.totals} tieOut={register.tieOut} />
      </Card>

      <Card title="Asset register" subtitle="Laid out like a sheet: in the CSV and the copied table, asset #n is on row n + 1 (row 1 is the header) and every column keeps its letter. Italic columns are derived by the model; dimmed cells are not used.">
        <AssetRegister register={register} mode={mode} filter={filter} onTick={onTick} />
      </Card>

      <Card title="Household and assumptions" subtitle="Every other input with a stable reference (G. grantor, E. estate, S. settings), whether the model uses it, and why not when it does not.">
        <HouseholdRegister register={register} mode={mode} filter={filter} onTick={onTick} />
      </Card>
    </div>
  );
}
