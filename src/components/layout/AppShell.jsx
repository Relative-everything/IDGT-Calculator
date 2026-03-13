import { useState } from 'react';

export default function AppShell({
  activeTab,
  setActiveTab,
  onNewScenario,
  onExportPDF,
  onExportExcel,
  children,
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const tabs = [
    'Asset Inputs',
    'Transfer Mechanism',
    'Gift vs. Death Analysis',
    'Projections',
    'Scenario Compare',
    'Monte Carlo',
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between bg-white border-b border-slate-200 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            className="text-slate-600 hover:text-slate-900"
            onClick={() => setIsSidebarOpen((v) => !v)}
            aria-label="Toggle sidebar"
          >
            <span className="sr-only">Toggle navigation</span>
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold">IDGT Asset Optimizer</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            onClick={onNewScenario}
          >
            New Scenario
          </button>
          <div className="relative">
            <button
              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              type="button"
            >
              Export ▼
            </button>
            <div className="absolute right-0 mt-1 w-44 rounded bg-white shadow-lg">
              <button
                className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={onExportPDF}
              >
                PDF Report
              </button>
              <button
                className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={onExportExcel}
              >
                Excel Export
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside
          className={`flex flex-col border-r border-slate-200 bg-white transition-all ${
            isSidebarOpen ? 'w-72' : 'w-0 overflow-hidden'
          }`}
        >
          <nav className="flex flex-col gap-1 p-3">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={`rounded px-3 py-2 text-left text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
