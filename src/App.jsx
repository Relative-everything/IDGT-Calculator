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
import { useIdgtModel } from './hooks/useIdgtModel.js';
import { useIngBreakeven } from './hooks/useIngBreakeven.js';
import { serializeScenario, parseScenario, rankingToCsv, newId, MAX_IMPORT_BYTES } from './hooks/scenarioIO.js';
import { DEFAULT_LIFE_TABLE_ID } from './data/lifeTables/index.js';
import { BASIC_EXCLUSION_2026 } from './data/exclusionAmounts.js';

const DEFAULT_GRANTOR = {
  age: '65', sex: 'male', useDeathYear: false, deathYear: '20', fedOrd: '37', stateOrd: '5', niit: '3.8', fedLtcg: '20', stateLtcg: '5',
  // life table and married couple (docs/changes/2026-09-27-life-tables/model.md)
  lifeTable: DEFAULT_LIFE_TABLE_ID, married: false, spouseAge: '63', spouseSex: 'female', spouseDeathYear: '25', portability: true,
};
const DEFAULT_ESTATE = {
  otherEstate: '20000000', otherEstateGrowth: '3', exclusion: String(BASIC_EXCLUSION_2026), exclusionIndexing: '2',
  priorGifts: '0', priorGiftYear: '2025', priorExclusionMode: 'year', priorGiftExclusion: '13990000',
  spousePriorGifts: '0', spousePriorGiftYear: '2025', spousePriorExclusionMode: 'year', spousePriorGiftExclusion: '13990000',
  estateTaxRate: '40', beneFedLtcg: '20', beneStateLtcg: '5', beneNiit: true, yearsToSale: '1', discountRate: '4', maxYears: '35',
};
const DEFAULT_SETTINGS = {
  rankKey: 'opt', discountAtDeath: false, saleAppliesToBaseline: true, swapCustom: false, swapBasisPct: '100', swapGrowth: '0', swapYield: '5.535', swapTaxRate: '45.8',
  // ING comparison (docs/changes/2026-09-27-ing-comparison/model.md §1): classic full burn; trust at the federal top rates + NIIT in a no-tax situs
  burnShare: '100', ingFedOrd: '37', ingFedLtcg: '20', ingStateRate: '0', ingAdminRate: '0', ingStateTaxOnGrantor: false,
};
const makeAsset = (over = {}) => ({
  id: newId(), name: 'Asset 1', fmv: '1000000', discount: '0', basis: '200000', growth: '7', yield: '2',
  saleYear: '0', postSaleGrowth: '6', postSaleYield: '1.5', annualExclusions: '0', ...over,
});
const DEFAULT_ASSETS = () => [
  makeAsset({ name: 'Growth stock (low basis)' }),
  makeAsset({ name: 'Family LP interest (30% discount)', fmv: '3000000', basis: '1500000', discount: '30', growth: '6', yield: '3' }),
  makeAsset({ name: 'Business interest, sale in yr 5', fmv: '5000000', basis: '500000', discount: '25', growth: '8', yield: '1', saleYear: '5', postSaleGrowth: '6', postSaleYield: '1.5' }),
];
const defaultsForImport = () => ({ grantor: DEFAULT_GRANTOR, estate: DEFAULT_ESTATE, settings: DEFAULT_SETTINGS, asset: makeAsset() });

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

  const reset = () => { setGrantor(DEFAULT_GRANTOR); setEstate(DEFAULT_ESTATE); setSettings(DEFAULT_SETTINGS); setAssets(DEFAULT_ASSETS()); setSelectedId(null); setNotice('Inputs reset to defaults.'); };
  const exportJson = () => download('idgt-scenario.json', serializeScenario({ grantor, estate, settings, assets }), 'application/json');
  const exportCsv = () => download('idgt-ranking.csv', rankingToCsv(ranked), 'text/csv');
  const importJson = (file) => {
    if (file.size > MAX_IMPORT_BYTES) { setNotice(`Could not load ${file.name}: the file is too large to be a scenario.`); return; }
    const reader = new FileReader();
    reader.onerror = () => setNotice(`Could not read ${file.name}.`);
    reader.onload = () => {
      try {
        const s = parseScenario(String(reader.result), defaultsForImport());
        setGrantor(s.grantor); setEstate(s.estate); setSettings(s.settings); setAssets(s.assets); setSelectedId(null);
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

  return (
    <AppShell actions={actions} sidebar={sidebar}>
      {notice && (
        <div className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-2">
          <span>{notice}</span><button type="button" className="text-muted" onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {mortality && !mortality.table.verified && !grantor.useDeathYear && (
        <div className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-ink">
          <strong>Mortality table unverified.</strong> {mortality.table.label} was never checked against its published source. Probability-weighted results depend on it; choose the verified SSA 2023 table, or an assumed death year for a table-independent result.
        </div>
      )}
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
    </AppShell>
  );
}
