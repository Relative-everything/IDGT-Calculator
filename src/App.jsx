import { useMemo, useRef, useState } from 'react';
import AppShell from './components/layout/AppShell.jsx';
import GrantorPanel from './components/inputs/GrantorPanel.jsx';
import EstatePanel from './components/inputs/EstatePanel.jsx';
import ModelSettingsPanel from './components/inputs/ModelSettingsPanel.jsx';
import AssetsPanel from './components/inputs/AssetsPanel.jsx';
import RankingTable from './components/results/RankingTable.jsx';
import AssetDetail from './components/results/AssetDetail.jsx';
import IngComparison from './components/results/IngComparison.jsx';
import IngPanel from './components/inputs/IngPanel.jsx';
import MethodologyPanel from './components/panels/MethodologyPanel.jsx';
import DeferredPanel from './components/panels/DeferredPanel.jsx';
import Button from './components/ui/Button.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import InputsAudit from './components/audit/InputsAudit.jsx';
import { useIdgtModel } from './hooks/useIdgtModel.js';
import { useInputRegister } from './hooks/useInputRegister.js';
import { assetTableTsv, registerToCsv } from './hooks/inputRegister.js';
import { useIngBreakeven } from './hooks/useIngBreakeven.js';
import { serializeScenario, parseScenario, rankingToCsv, MAX_IMPORT_BYTES } from './hooks/scenarioIO.js';
import { DEFAULT_GRANTOR, DEFAULT_ESTATE, DEFAULT_SETTINGS, DEFAULT_ASSETS, makeAsset } from './hooks/defaults.js';

const defaultsForImport = () => ({ grantor: DEFAULT_GRANTOR, estate: DEFAULT_ESTATE, settings: DEFAULT_SETTINGS, asset: makeAsset() });
const EMPTY_AUDIT = { reviewer: '', ticks: {} };
const today = () => new Date().toISOString().slice(0, 10);
// The view is kept in the URL hash (#audit) so the audit page can be bookmarked; state itself is never stored (repo rule).
const initialView = () => (typeof window !== 'undefined' && window.location.hash === '#audit' ? 'audit' : 'analysis');

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [grantor, setGrantor] = useState(DEFAULT_GRANTOR);
  const [estate, setEstate] = useState(DEFAULT_ESTATE);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [assets, setAssets] = useState(DEFAULT_ASSETS);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [view, setView] = useState(initialView);
  const [audit, setAudit] = useState(EMPTY_AUDIT);
  const [auditMode, setAuditMode] = useState('typed');
  const [auditFilter, setAuditFilter] = useState('all');
  const [auditWide, setAuditWide] = useState(false);
  const fileRef = useRef(null);

  const { perAsset, ranked, remainingExclusion, neutralSwap, swapRates, mortality, isStale } = useIdgtModel({ grantor, estate, settings, assets });

  const errorsById = useMemo(() => {
    const out = {};
    for (const a of perAsset) out[a.id] = Object.fromEntries(a.errors.map((e) => [e.field, e.message]));
    return out;
  }, [perAsset]);
  const sharedErrors = useMemo(() => (perAsset[0] ? errorsById[perAsset[0].id] : {}), [perAsset, errorsById]);
  const invalid = perAsset.filter((a) => a.errors.length);
  const selected = ranked.find((r) => r.id === selectedId) ?? ranked[0] ?? null;
  const ingBreakeven = useIngBreakeven(selected);
  const register = useInputRegister({ grantor, estate, settings, assets, perAsset, audit });

  const changeView = (next) => {
    setView(next);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', next === 'audit' ? '#audit' : `${window.location.pathname}${window.location.search}`);
  };
  const tick = (key, value, on) => setAudit((a) => {
    const ticks = { ...a.ticks };
    if (on) ticks[key] = { v: value, at: today() };
    else delete ticks[key];
    return { ...a, ticks };
  });
  const copyAssetTable = async () => {
    try {
      await navigator.clipboard.writeText(assetTableTsv(register, auditMode));
      setNotice(`Copied ${register.assets.length} asset row${register.assets.length === 1 ? '' : 's'} with headers and totals (tab-separated): paste into Excel beside the source.`);
    } catch {
      setNotice('The browser refused clipboard access. Use Download audit CSV instead.');
    }
  };
  const downloadAudit = () => download(`idgt-inputs-audit-${auditMode === 'typed' ? 'as-typed' : 'model-values'}.csv`,
    registerToCsv(register, auditMode, { reviewer: audit.reviewer, generatedAt: new Date().toISOString() }), 'text/csv');

  const reset = () => { setGrantor(DEFAULT_GRANTOR); setEstate(DEFAULT_ESTATE); setSettings(DEFAULT_SETTINGS); setAssets(DEFAULT_ASSETS()); setAudit(EMPTY_AUDIT); setSelectedId(null); setNotice('Inputs reset to defaults.'); };
  const exportJson = () => download('idgt-scenario.json', serializeScenario({ grantor, estate, settings, assets, audit }), 'application/json');
  const exportCsv = () => download('idgt-ranking.csv', rankingToCsv(ranked), 'text/csv');
  const importJson = (file) => {
    if (file.size > MAX_IMPORT_BYTES) { setNotice(`Could not load ${file.name}: the file is too large to be a scenario.`); return; }
    const reader = new FileReader();
    reader.onerror = () => setNotice(`Could not read ${file.name}.`);
    reader.onload = () => {
      try {
        const s = parseScenario(String(reader.result), defaultsForImport());
        setGrantor(s.grantor); setEstate(s.estate); setSettings(s.settings); setAssets(s.assets); setAudit(s.audit); setSelectedId(null);
        setNotice(`Loaded ${file.name}.${s.dropped > 0 ? ` ${s.dropped} asset entr${s.dropped === 1 ? 'y was' : 'ies were'} skipped (not an object, or beyond the ${s.assets.length}-asset limit).` : ''}`);
      } catch (err) { setNotice(`Could not load ${file.name}: ${err.message}`); }
    };
    reader.readAsText(file);
  };

  const actions = (
    <>
      <Button onClick={reset}>Reset</Button>
      <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
      <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
      <Button onClick={exportJson}>Export JSON</Button>
      <Button variant="primary" onClick={exportCsv} disabled={ranked.length === 0}>Download CSV</Button>
    </>
  );

  const sidebar = (
    <>
      <GrantorPanel grantor={grantor} onChange={setGrantor} errors={sharedErrors} mortality={mortality} />
      <EstatePanel estate={estate} onChange={setEstate} errors={sharedErrors} married={Boolean(grantor.married)} />
      <AssetsPanel assets={assets} onChange={setAssets} errorsById={errorsById} />
      <ModelSettingsPanel settings={settings} onChange={setSettings} errors={sharedErrors} neutralSwap={neutralSwap} swapRates={swapRates} />
      <IngPanel settings={settings} onChange={setSettings} errors={sharedErrors} />
    </>
  );

  const flagged = register.flags.filter((f) => f.severity !== 'confirm').length;
  const tabs = {
    value: view,
    onChange: changeView,
    items: [
      { value: 'analysis', label: 'Analysis' },
      { value: 'audit', label: 'Inputs audit', badge: flagged > 0 ? flagged : null },
    ],
  };

  return (
    <AppShell actions={actions} sidebar={sidebar} tabs={tabs} wide={view === 'audit' && auditWide}>
      {notice && (
        <div className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-2 print:hidden">
          <span>{notice}</span><button type="button" className="text-muted" onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {mortality && !mortality.table.verified && !grantor.useDeathYear && (
        <div className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-ink">
          <strong>Mortality table unverified.</strong> {mortality.table.label} was never checked against its published source. Probability-weighted results depend on it; choose the verified SSA 2023 table, or an assumed death year for a table-independent result.
        </div>
      )}
      {view === 'audit' ? (
        <ErrorBoundary>
          <InputsAudit register={register} mode={auditMode} onModeChange={setAuditMode} filter={auditFilter} onFilterChange={setAuditFilter}
            reviewer={audit.reviewer} onReviewerChange={(reviewer) => setAudit((a) => ({ ...a, reviewer }))} onTick={tick}
            onClearTicks={() => setAudit((a) => ({ ...a, ticks: {} }))} onCopy={copyAssetTable} onDownload={downloadAudit}
            onPrint={() => window.print()} printedOn={today()} wide={auditWide} onWideChange={setAuditWide} />
        </ErrorBoundary>
      ) : (
        <>
          <ErrorBoundary>
            <div className={isStale ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
              <RankingTable ranked={ranked} selectedId={selected?.id} onSelect={setSelectedId} rankKey={settings.rankKey} remainingExclusion={remainingExclusion} invalid={invalid} />
              <div className="mt-5">
                <AssetDetail entry={selected} />
              </div>
              <div className="mt-5">
                <IngComparison entry={selected} breakevens={ingBreakeven.breakevens} grid={ingBreakeven.grid} isStale={ingBreakeven.isStale} error={ingBreakeven.error} />
              </div>
            </div>
          </ErrorBoundary>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <MethodologyPanel />
            <DeferredPanel />
          </div>
        </>
      )}
    </AppShell>
  );
}
