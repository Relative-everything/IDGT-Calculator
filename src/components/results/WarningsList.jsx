export default function WarningsList({ warnings }) {
  if (!warnings?.length) return null;
  return (
    <ul className="space-y-1.5">
      {warnings.map((w, i) => (
        <li key={`${w.code}-${i}`} className="flex gap-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-ink">
          <span aria-hidden="true">⚠</span>
          <span><span className="mr-1 rounded bg-surface px-1 text-[10px] uppercase tracking-wide text-muted">{w.code}</span>{w.message}</span>
        </li>
      ))}
    </ul>
  );
}
