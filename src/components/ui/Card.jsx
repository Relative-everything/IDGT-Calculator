export default function Card({ title, subtitle, aside, children, className = '', id }) {
  return (
    <section id={id} className={`rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}>
      {(title || aside) && (
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
          </div>
          {aside && <div className="text-sm text-ink-2">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
