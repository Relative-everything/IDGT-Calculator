/** The reviewer's tick for one row; the date it was ticked shows beside it. */
export default function TickBox({ id, label, checked, at, onChange, disabled }) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11px] text-muted print:flex-wrap print:gap-0.5 print:whitespace-normal print:text-[8px]">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        aria-label={label} className="h-4 w-4 accent-[var(--good)]" />
      {checked && at && <span className="tabular">{at}</span>}
    </label>
  );
}
