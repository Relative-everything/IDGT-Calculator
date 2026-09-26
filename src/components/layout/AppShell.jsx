export default function AppShell({ actions, sidebar, children }) {
  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold leading-tight">IDGT Asset Analyzer</h1>
            <p className="text-xs text-ink-2">Gift-to-IDGT heir-wealth ranking with optimal swap timing · federal, 2026 law</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-5 px-4 py-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto lg:pr-1">
          {sidebar}
        </aside>
        <main className="min-w-0 space-y-5">{children}</main>
      </div>

      <footer className="mx-auto max-w-[1400px] px-4 pb-8 pt-2 text-xs text-muted">
        Illustrative model for planning discussion — not tax, legal or investment advice. Federal transfer tax only;
        state estate and inheritance taxes are not modelled in this version. Methodology and authorities are documented
        on this page; verify every input against the client's facts and current law.
      </footer>
    </div>
  );
}
