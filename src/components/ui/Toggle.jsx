import InfoTip from './InfoTip.jsx';

export default function Toggle({ id, label, checked, onChange, tip, hint, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-sm text-ink">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
        />
        <span>
          {label}
          <InfoTip text={tip} />
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
      </label>
    </div>
  );
}
