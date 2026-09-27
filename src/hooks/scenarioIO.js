// Scenario portability without localStorage (repo rule): JSON export/import and CSV of the ranking.
// Pure helpers; the App wires them to buttons. Imported files are untrusted: every field is coerced
// to the type the UI expects, unknown keys are dropped, ids are always regenerated, lists are capped.

export const SCENARIO_VERSION = 1;
export const MAX_IMPORT_ASSETS = 50;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Stable unique id for asset rows; falls back when crypto.randomUUID is unavailable (non-secure http). */
export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const STRING_FIELDS = {
  grantor: ['age', 'deathYear', 'fedOrd', 'stateOrd', 'niit', 'fedLtcg', 'stateLtcg'],
  estate: ['otherEstate', 'otherEstateGrowth', 'exclusion', 'exclusionIndexing', 'priorGifts', 'priorGiftYear', 'priorGiftExclusion',
    'estateTaxRate', 'beneFedLtcg', 'beneStateLtcg', 'yearsToSale', 'discountRate', 'maxYears'],
  settings: ['swapBasisPct', 'swapGrowth', 'swapYield', 'swapTaxRate', 'burnShare', 'ingFedOrd', 'ingFedLtcg', 'ingStateRate', 'ingAdminRate'],
  asset: ['name', 'fmv', 'discount', 'basis', 'growth', 'yield', 'saleYear', 'postSaleGrowth', 'postSaleYield', 'annualExclusions'],
};
const BOOL_FIELDS = {
  grantor: ['useDeathYear'],
  estate: ['beneNiit'],
  settings: ['discountAtDeath', 'saleAppliesToBaseline', 'swapCustom', 'ingStateTaxOnGrantor'],
  asset: [],
};
const ENUM_FIELDS = {
  grantor: { sex: ['male', 'female'] },
  estate: { priorExclusionMode: ['year', 'custom'] },
  settings: { rankKey: ['opt', 'none'] },
  asset: {},
};

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const asString = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined);

function coerceSection(kind, raw, fallback) {
  const out = { ...fallback };
  if (!isPlainObject(raw)) return out;
  for (const key of STRING_FIELDS[kind]) {
    const v = asString(raw[key]);
    if (v !== undefined) out[key] = v.slice(0, 200);
  }
  for (const key of BOOL_FIELDS[kind]) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  for (const [key, allowed] of Object.entries(ENUM_FIELDS[kind])) {
    if (allowed.includes(raw[key])) out[key] = raw[key];
  }
  return out;
}

export function serializeScenario({ grantor, estate, settings, assets }) {
  return JSON.stringify({ version: SCENARIO_VERSION, savedAt: new Date().toISOString(), grantor, estate, settings, assets }, null, 2);
}

/** Returns { grantor, estate, settings, assets, dropped } or throws with a readable message. */
export function parseScenario(text, defaults) {
  if (typeof text === 'string' && text.length > MAX_IMPORT_BYTES) throw new Error('The file is too large to be a scenario.');
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
  if (!isPlainObject(obj)) throw new Error('The file does not contain a scenario object.');
  if (obj.version != null && obj.version !== SCENARIO_VERSION) throw new Error(`Unsupported scenario version ${String(obj.version)}.`);
  const rawAssets = Array.isArray(obj.assets) ? obj.assets.filter(isPlainObject) : [];
  const dropped = Array.isArray(obj.assets) ? obj.assets.length - Math.min(rawAssets.length, MAX_IMPORT_ASSETS) : 0;
  const assets = rawAssets.slice(0, MAX_IMPORT_ASSETS).map((a, i) => {
    const asset = coerceSection('asset', a, { ...defaults.asset, name: `Asset ${i + 1}` });
    return { ...asset, id: newId() };
  });
  return {
    grantor: coerceSection('grantor', obj.grantor, defaults.grantor),
    estate: coerceSection('estate', obj.estate, defaults.estate),
    settings: coerceSection('settings', obj.settings, defaults.settings),
    assets: assets.length ? assets : [{ ...defaults.asset, id: newId() }],
    dropped,
  };
}

/** CSV cell: numbers raw; strings quoted when needed and formula-leading text neutralised (CWE-1236). */
export function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  let quote = /[",\r\n]/.test(s);
  if (/^[=+\-@\t\r]/.test(s)) { s = `'${s}`; quote = true; }
  return quote ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rankingToCsv(ranked) {
  const header = ['Rank', 'Asset', 'Taxable gift', 'Exclusion used', 'Gift tax paid', 'NPV no swap', 'Optimal swap year', 'NPV optimal swap',
    'NPV per $ taxable gift (opt)', 'NPV per $ taxable gift (none)', 'NPV per $ FMV (opt)', 'Deathbed-swap value', 'Expected death year',
    'Cumulative taxable gift', 'Freeze (opt)', 'Tax burn (opt)', 'Gift tax (opt)', 'Residual (opt)', 'Step-up (opt)',
    'NPV ING', 'ING minus IDGT (best swap)', 'ING minus IDGT (no swap)', 'Structure', 'ING state saving (net)', 'ING location (net)', 'ING fee (net)', 'ING step-up'];
  const lines = [header.map(csvCell).join(',')];
  for (const row of ranked) {
    const r = row.result;
    const c = r.components.opt;
    lines.push([row.rank, row.name, r.derived.Ug, r.derived.Uc, r.derived.G, r.npvNone, r.sStar === 0 ? 'none' : r.sStar, r.npvOpt,
      r.eff.opt, r.eff.none, r.effPerFMV.opt, r.npvPF, r.derived.expectedDeathYear, row.cumulativeTaxableGift,
      c.freeze, c.burn, c.giftTax, c.resid, c.stepUp,
      ...(row.ing
        ? [row.ing.npv, row.ing.vsIdgt.deltaOpt, row.ing.vsIdgt.deltaNone, row.ing.vsIdgt.verdict,
          row.ing.components.ssNet, row.ing.components.locNet, row.ing.components.feeNet, row.ing.components.stepUp]
        : [null, null, null, null, null, null, null, null])].map(csvCell).join(','));
  }
  return lines.join('\n');
}
