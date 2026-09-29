export default function Button({ children, onClick, variant = 'secondary', type = 'button', className = '', disabled, title, autoFocus }) {
  const base = 'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50';
  const styles = {
    primary: 'bg-accent text-accent-ink hover:opacity-90',
    secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
    ghost: 'text-ink-2 hover:bg-surface-2',
    danger: 'text-bad hover:bg-bad-soft',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} autoFocus={autoFocus} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}
