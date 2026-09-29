import { ASSET_COLUMNS, assetTableRows } from '../../hooks/inputRegister.js';
import FlagChips from './FlagChips.jsx';
import TickBox from './TickBox.jsx';
import { SEVERITY_CELL, statusText, worstSeverity } from './auditLabels.js';

// Pinned columns: the row number and name on the left, the tick on the right; a 1px shadow marks each pinned edge.
const STICKY = {
  row: 'sticky left-0 z-[1] w-10 min-w-10',
  name: 'sticky left-10 z-[1] min-w-[13rem] max-w-[18rem] shadow-[1px_0_0_var(--line-strong)]',
  verified: 'sticky right-0 z-[1] min-w-[7.5rem] shadow-[-1px_0_0_var(--line-strong)]',
};
const MIN_WIDTH = { source: 'min-w-[9rem]', flags: 'min-w-[18rem]' };
const isNumeric = (c) => c.kind && c.kind !== 'text';

/**
 * The asset register laid out like a sheet: column letters, one row per asset, a totals row. The values are the same
 * strings the CSV export writes (assetTableRows), so what is on screen is what lands in the file, cell for cell.
 */
export default function AssetRegister({ register, mode, filter, onTick }) {
  const { header, rows, totals } = assetTableRows(register, mode);
  const shown = register.assets.map((r, i) => ({ r, cells: rows[i] })).filter(({ r }) => (
    filter === 'unverified' ? !r.verified : filter === 'flagged' ? r.flags.length > 0 : true));
  return (
    <div className="scroll-x rounded-md border border-line print:overflow-visible">
      <table className="tabular w-full min-w-[1480px] border-collapse text-[12.5px] print:min-w-0 print:text-[9px]">
        <thead>
          <tr className="border-b border-line bg-surface-2 font-mono text-[10.5px] text-muted">
            {ASSET_COLUMNS.map((c) => (
              <th key={c.key} scope="col" className={`px-2 py-0.5 font-normal ${isNumeric(c) ? 'text-right' : 'text-left'} ${STICKY[c.key] ?? ''} ${STICKY[c.key] ? 'bg-surface-2' : ''} print:static print:shadow-none`}>{c.letter}</th>
            ))}
          </tr>
          <tr className="border-b border-line-strong text-[11.5px] text-ink-2">
            {ASSET_COLUMNS.map((c, i) => (
              <th key={c.key} scope="col" className={`px-2 py-1.5 align-bottom font-medium ${isNumeric(c) ? 'text-right' : 'text-left'} ${c.derived ? 'italic text-muted' : ''} ${STICKY[c.key] ?? ''} ${MIN_WIDTH[c.key] ?? ''} ${STICKY[c.key] ? 'bg-surface' : ''} print:static print:min-w-0 print:shadow-none`}>
                {header[i]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map(({ r, cells }) => (
            <tr key={r.id} className="border-b border-line align-top">
              {ASSET_COLUMNS.map((c, i) => {
                if (c.key === 'flags') return <td key={c.key} className={`px-2 py-1 ${MIN_WIDTH.flags} print:min-w-0`}><FlagChips flags={r.flags} /></td>;
                if (c.key === 'verified') {
                  return (
                    <td key={c.key} className={`bg-surface px-2 py-1 ${STICKY.verified} print:static print:min-w-0 print:shadow-none`}>
                      <TickBox id={`tick-${r.id}`} label={`Asset ${r.row}, ${r.name}: matches the source`} checked={r.verified} at={r.tickedAt}
                        onChange={(on) => onTick(r.tickKey, r.tickValue, on)} />
                    </td>
                  );
                }
                const cell = r.cells[c.key];
                const worst = cell ? worstSeverity(cell.flags) : null;
                const unused = cell?.status.code === 'unused';
                const title = cell ? [unused ? statusText(cell.status) : null, ...cell.flags.map((f) => f.message)].filter(Boolean).join('\n') : undefined;
                return (
                  <td key={c.key} title={title || undefined}
                    className={`px-2 py-1 ${isNumeric(c) ? 'whitespace-nowrap text-right font-mono' : 'text-left'} ${c.key === 'row' ? 'text-muted' : ''}
                      ${c.derived ? 'text-ink-2' : 'text-ink'} ${unused ? 'text-muted opacity-60' : ''} ${worst ? SEVERITY_CELL[worst] : ''}
                      ${STICKY[c.key] ?? ''} ${MIN_WIDTH[c.key] ?? ''} ${STICKY[c.key] && !worst ? 'bg-surface' : ''} print:static print:min-w-0 print:shadow-none`}>
                    {cells[i] !== '' || !cell || String(cell.raw ?? '').trim() === ''
                      ? cells[i]
                      : <span className="font-sans text-xs italic">not a number</span>}
                  </td>
                );
              })}
            </tr>
          ))}
          {shown.length === 0 && (
            <tr><td colSpan={ASSET_COLUMNS.length} className="px-3 py-3 text-sm text-muted">No asset rows match this filter.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line-strong bg-surface-2 font-medium">
            {ASSET_COLUMNS.map((c, i) => (
              <td key={c.key} className={`px-2 py-1.5 ${isNumeric(c) ? 'whitespace-nowrap text-right font-mono' : 'text-left'} ${STICKY[c.key] ?? ''} ${STICKY[c.key] ? 'bg-surface-2' : ''} print:static print:shadow-none`}>{totals[i]}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
