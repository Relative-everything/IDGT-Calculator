/**
 * Page frame: header (title, view tabs, actions), input sidebar and main column. `tabs` = { value, onChange, items };
 * `wide` hides the sidebar so a wide table (the inputs audit register) gets the full width.
 */
export default function AppShell({ actions, sidebar, tabs, wide = false, children }) {
  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div>
              <h1 className="text-lg font-semibold leading-tight">IDGT Asset Analyzer</h1>
              <p className="text-xs text-ink-2">Gift-to-IDGT heir-wealth ranking with optimal swap timing and an ING-trust comparison · federal, 2026 law</p>
            </div>
            {tabs && (
              <nav className="inline-flex rounded-md border border-line-strong p-0.5" aria-label="View">
                {tabs.items.map((t) => (
                  <button key={t.value} type="button" aria-current={tabs.value === t.value ? 'page' : undefined} onClick={() => tabs.onChange(t.value)}
                    className={`rounded px-3 py-1 text-sm font-medium ${tabs.value === t.value ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-surface-2'}`}>
                    {t.label}{t.badge != null && <span className={`ml-1.5 rounded px-1 text-[11px] ${tabs.value === t.value ? 'bg-accent-ink/20' : 'bg-surface-2'}`}>{t.badge}</span>}
                  </button>
                ))}
              </nav>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      </header>

      <div className={`mx-auto grid grid-cols-1 gap-5 px-4 py-5 print:block print:max-w-none print:p-0 ${wide ? 'max-w-[1800px]' : 'max-w-[1400px] lg:grid-cols-[380px_minmax(0,1fr)]'}`}>
        {!wide && (
          <aside className="space-y-4 lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto lg:pr-1 print:hidden">
            {sidebar}
          </aside>
        )}
        <main className="min-w-0 space-y-5">{children}</main>
      </div>

      <footer className="mx-auto max-w-[1400px] px-4 pb-8 pt-2 text-xs text-muted print:hidden">
        Illustrative model for planning discussion — not tax, legal or investment advice. Federal transfer tax only;
        state estate and inheritance taxes are not modelled in this version. Methodology and authorities are documented
        on this page; verify every input against the client's facts and current law.
      </footer>
    </div>
  );
}
