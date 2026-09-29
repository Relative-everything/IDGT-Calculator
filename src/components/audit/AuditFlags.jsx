import { FLAG_LABELS, SEVERITY_CHIP, SEVERITY_TEXT } from './auditLabels.js';

/** Every flag on one list, worst first, with the reference of the cell or row it belongs to. */
export default function AuditFlags({ flags }) {
  if (!flags.length) {
    return <p className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-2">No data-entry flags: every typed value parses cleanly and no row repeats another.</p>;
  }
  const counts = flags.reduce((m, f) => ({ ...m, [f.severity]: (m[f.severity] ?? 0) + 1 }), {});
  return (
    <details open className="rounded-md border border-line bg-surface">
      <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm font-medium text-ink">
        <span>{flags.length} item{flags.length === 1 ? '' : 's'} to review</span>
        {['error', 'check', 'confirm'].filter((s) => counts[s]).map((s) => (
          <span key={s} className={`rounded border px-1.5 text-[11px] font-normal leading-5 ${SEVERITY_CHIP[s]}`}>{counts[s]} · {SEVERITY_TEXT[s].toLowerCase()}</span>
        ))}
      </summary>
      <ul className="max-h-72 divide-y divide-line overflow-y-auto border-t border-line text-[13px]">
        {flags.map((f, i) => (
          <li key={`${f.ref}-${f.code}-${i}`} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-3 py-1.5 sm:grid-cols-[7.5rem_9.5rem_1fr]">
            <span className="tabular font-mono text-xs text-ink-2">{f.ref}</span>
            <span className={`w-fit self-start whitespace-nowrap rounded border px-1.5 text-[11px] leading-5 ${SEVERITY_CHIP[f.severity]}`}>{FLAG_LABELS[f.code] ?? f.code}</span>
            <span className="col-span-2 text-ink-2 sm:col-span-1"><span className="text-muted">{f.where}: </span>{f.message}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
