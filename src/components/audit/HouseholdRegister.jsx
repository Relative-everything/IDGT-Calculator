import { bare, cellValue, unitFor } from '../../hooks/inputRegister.js';
import FlagChips from './FlagChips.jsx';
import TickBox from './TickBox.jsx';
import { SEVERITY_CELL, statusText, worstSeverity } from './auditLabels.js';

const auditable = (r) => r.status.code === 'used' || r.status.code === 'scope';

/** Every other input, grouped as on the input panels, then the model inputs that combine several of them. */
export default function HouseholdRegister({ register, mode, filter, onTick }) {
  const rows = register.household.filter((r) => (
    filter === 'unverified' ? auditable(r) && !r.verified : filter === 'flagged' ? r.flags.length > 0 : true));
  const sections = [];
  for (const r of rows) {
    if (sections.at(-1)?.name !== r.section) sections.push({ name: r.section, rows: [] });
    sections.at(-1).rows.push(r);
  }
  return (
    <div className="scroll-x rounded-md border border-line print:overflow-visible">
      <table className="tabular w-full min-w-[860px] border-collapse text-[12.5px] print:min-w-0 print:text-[9px]">
        <thead>
          <tr className="border-b border-line-strong text-left text-[11.5px] text-ink-2">
            <th scope="col" className="px-2 py-1.5 font-medium">Ref</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Input</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">{mode === 'typed' ? 'Value as typed' : 'Value as the model reads it'}</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Unit</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Status</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Flags</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Verified</th>
          </tr>
        </thead>
        {sections.map((sec) => (
          <tbody key={sec.name}>
            <tr className="bg-surface-2"><th scope="rowgroup" colSpan={7} className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">{sec.name}</th></tr>
            {sec.rows.map((r) => {
              const unusedRow = !auditable(r);
              const worst = worstSeverity(r.flags);
              const value = cellValue(r.kind, r.raw, r.model, mode);
              return (
                <tr key={r.ref} className={`border-b border-line align-top ${unusedRow ? 'text-muted' : 'text-ink'}`}>
                  <td className="whitespace-nowrap px-2 py-1 font-mono text-[11.5px] text-ink-2">{r.ref}</td>
                  <td className="px-2 py-1">{r.label}</td>
                  <td className={`whitespace-nowrap px-2 py-1 text-right font-mono ${worst ? SEVERITY_CELL[worst] : ''}`} title={r.flags.map((f) => f.message).join('\n') || undefined}>
                    {value}{r.display && mode === 'typed' && <span className="ml-1.5 font-sans text-xs text-muted">{r.display}</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-ink-2">{r.unit ?? unitFor(r.kind, mode)}</td>
                  <td className="px-2 py-1 text-xs text-ink-2">{statusText(r.status)}</td>
                  <td className="px-2 py-1"><FlagChips flags={r.flags} /></td>
                  <td className="px-2 py-1">
                    {auditable(r)
                      ? <TickBox id={`tick-${r.ref}`} label={`${r.label}: matches the source`} checked={r.verified} at={r.tickedAt} onChange={(on) => onTick(r.tickKey, r.tickValue, on)} />
                      : <span className="text-[11px] text-muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
        {filter === 'all' && register.derived.length > 0 && (
          <tbody>
            <tr className="bg-surface-2"><th scope="rowgroup" colSpan={7} className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Derived model inputs (combined from the fields above)</th></tr>
            {register.derived.map((d) => (
              <tr key={d.ref} className="border-b border-line align-top text-ink-2">
                <td className="whitespace-nowrap px-2 py-1 font-mono text-[11.5px]">{d.ref}</td>
                <td className="px-2 py-1">{d.label}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right font-mono">{bare(d.model, d.kind)}</td>
                <td className="whitespace-nowrap px-2 py-1">{unitFor(d.kind, 'model')}</td>
                <td className="px-2 py-1 text-xs">derived</td>
                <td className="px-2 py-1" />
                <td className="px-2 py-1" />
              </tr>
            ))}
          </tbody>
        )}
        {rows.length === 0 && (
          <tbody><tr><td colSpan={7} className="px-3 py-3 text-sm text-muted">No inputs match this filter.</td></tr></tbody>
        )}
      </table>
    </div>
  );
}
