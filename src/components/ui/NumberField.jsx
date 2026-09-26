import InfoTip from './InfoTip.jsx';

/**
 * Text input for numbers (free typing; the hook parses). `prefix` "$" or `suffix` "%" / "yrs".
 */
export default function NumberField({ id, label, value, onChange, prefix, suffix, hint, tip, error, disabled, placeholder, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-ink-2">
        {label}
        <InfoTip text={tip} />
      </label>
      <div className={`mt-1 flex items-center rounded-md border bg-surface ${error ? 'border-bad' : 'border-line-strong'} ${disabled ? 'opacity-60' : ''} focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft`}>
        {prefix && <span className="pl-2.5 text-sm text-muted">{prefix}</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value ?? ''}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="tabular w-full min-w-0 bg-transparent px-2.5 py-1.5 text-sm text-ink outline-none"
        />
        {suffix && <span className="pr-2.5 text-sm text-muted">{suffix}</span>}
      </div>
      {error ? <p className="mt-1 text-xs text-bad">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
