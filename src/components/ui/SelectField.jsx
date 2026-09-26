import InfoTip from './InfoTip.jsx';

export default function SelectField({ id, label, value, onChange, options, tip, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-ink-2">
        {label}
        <InfoTip text={tip} />
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
