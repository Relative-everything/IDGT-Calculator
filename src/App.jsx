import { useMemo, useRef, useState } from 'react';
import AppShell from './components/layout/AppShell.jsx';
import GrantorPanel from './components/inputs/GrantorPanel.jsx';
import EstatePanel from './components/inputs/EstatePanel.jsx';
import ModelSettingsPanel from './components/inputs/ModelSettingsPanel.jsx';
import AssetsPanel from './components/inputs/AssetsPanel.jsx';
import RankingTable from './components/results/RankingTable.jsx';
import AssetDetail from './components/results/AssetDetail.jsx';
import MethodologyPanel from './components/panels/MethodologyPanel.jsx';
import DeferredPanel from './components/panels/DeferredPanel.jsx';
import Button from './components/ui/Button.jsx';
import { useIdgtModel } from './hooks/useIdgtModel.js';
import { parseNum } from './hooks/buildInputs.js';
import { serializeScenario, parseScenario, rankingToCsv } from './hooks/scenarioIO.js';
import { MORTALITY_TABLE_META } from './data/mortalityTable.js';
import { BASIC_EXCLUSION_2026 } from './data/exclusionAmounts.js';

const DEFAULT_GRANTOR = { age: '65', sex: 'male', useDeathYear: false, deathYear: '20', fedOrd: '37', stateOrd: '5', niit: '3.8', fedLtcg: '20', stateLtcg: '5' };
const DEFAULT_ESTATE = {
  otherEstate: '20000000', otherEstateGrowth: '3', exclusion: String(BASIC_EXCLUSION_2026), exclusionIndexing: '2',
  priorGifts: '0', priorGiftYear: '2025', priorExclusionMode: 'year', priorGiftExclusion: '13990000',
  estateTaxRate: '40', beneFedLtcg: '20', beneStateLtcg: '5', beneNiit: true, yearsToSale: '1', discountRate: '4', maxYears: '35',
};
const DEFAULT_SETTINGS = { rankKey: 'opt', discountAtDeath: false, saleAppliesToBaseline: true, swapCustom: false, swapBasisPct: '100', swapGrowth: '0', swapYield: '5.535', swapTaxRate: '45.8' };
const makeAsset = (over = {}) => ({
  id: crypto.randomUUID(), name: 'Asset 1', fmv: '1000000', discount: '0', basis: '200000', growth: '7', yield: '2',
  saleYear: '0', postSaleGrowth: '6', postSaleYield: '1.5', annualExclusions: '0', ...over,
});
const DEFAULT_ASSETS = () => [
  makeAsset({ name: 'Growth stock (low basis)' }),
  makeAsset({ name: 'Family LP interest (30% discount)', fmv: '3000000', basis: '1500000', discount: '30', growth: '6', yield: '3' }),
  makeAsset({ name: 'Business interest, sale in yr 5', fmv: '5000000', basis: '500000', discount: '25', growth: '8', yield: '1', saleYear: '5', postSaleGrowth: '6', postSaleYield: '1.5' }),
];
const DEFAULTS = { grantor: DEFAULT_GRANTOR, estate: DEFAULT_ESTATE, settings: DEFAULT_SETTINGS, asset: makeAsset() };

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

  const { perAsset, ranked, remainingExclusion, neutralSwapYieldPct, isStale } = useIdgtModel({ grantor, estate, settings, assets });

  const errorsById = useMemo(() => {
    const out = {};
    for (const a of perAsset) out[a.id] = Object.fromEntries(a.errors.map((e) => [e.field, e.message]));
    return out;
  }, [perAsset]);
  const sharedErrors = useMemo(() => (perAsset[0] ? errorsById[perAsset[0].id] : {}), [perAsset, errorsById]);
  const invalid = perAsset.filter((a) => a.errors.length);
  const selected = ranked.find((r) => r.id === selectedId) ?? ranked[0] ?? null;

  const reset = () => { setGrantor(DEFAULT_GRANTOR); setEstate(DEFAULT_ESTATE); setSettings(DEFAULT_SETTINGS); setAssets(DEFAULT_ASSETS()); setSelectedId(null); setNotice('Inputs reset to defaults.'); };
  const exportJson = () => download('idgt-scenario.json', serializeScenario({ grantor, estate, settings, assets }), 'application/json');
  const exportCsv = () => download('idgt-ranking.csv', rankingToCsv(ranked), 'text/csv');
  const importJson = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const s = parseScenario(String(reader.result), DEFAULTS);
        setGrantor(s.grantor); setEstate(s.estate); setSettings(s.settings); setAssets(s.assets); setSelectedId(null);
        setNotice(`Loaded ${file.name}.`);
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
      <GrantorPanel grantor={grantor} onChange={setGrantor} errors={sharedErrors} />
      <EstatePanel estate={estate} onChange={setEstate} errors={sharedErrors} />
      <AssetsPanel assets={assets} onChange={setAssets} errorsById={errorsById} />
      <ModelSettingsPanel settings={settings} onChange={setSettings} errors={sharedErrors} neutralYieldPct={neutralSwapYieldPct} />
    </>
  );

  return (
    <AppShell actions={actions} sidebar={sidebar}>
      {notice && (
        <div className="flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-2">
          <span>{notice}</span><button type="button" className="text-muted" onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {!MORTALITY_TABLE_META.verified && !grantor.useDeathYear && (
        <div className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-ink">
          <strong>Mortality table unverified.</strong> The bundled SSA {MORTALITY_TABLE_META.periodYear} period life table could not be checked against ssa.gov when this build was made. Probability-weighted results depend on it; switch to an assumed death year for a table-independent result.
        </div>
      )}
      <div className={isStale ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
        <RankingTable ranked={ranked} selectedId={selected?.id} onSelect={setSelectedId} rankKey={settings.rankKey} remainingExclusion={remainingExclusion} invalid={invalid} />
        <div className="mt-5">
          <AssetDetail entry={selected} age={parseNum(grantor.age)} maxYears={parseNum(estate.maxYears)} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <MethodologyPanel />
        <DeferredPanel />
      </div>
    </AppShell>
  );
}
