// Scenario portability without localStorage (repo rule): JSON export/import and CSV of the ranking.
// Pure helpers; the App wires them to buttons. Imported files are untrusted: every field is coerced
// to the type the UI expects, unknown keys are dropped, ids are always regenerated, lists are capped.

import { LIFE_TABLES, LIFE_TABLE_BY_ID } from '../data/lifeTables/index.js';

export const SCENARIO_VERSION = 1;
export const MAX_IMPORT_ASSETS = 50;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
// Longest text a field keeps on import; the asset name and Source ref inputs stop at the same length, so a row (and its
// tick fingerprint) survives Export/Import JSON unchanged.
export const MAX_TEXT_FIELD_LENGTH = 200;
// Inputs audit ticks (docs/changes/2026-09-28-inputs-audit/plan.md): household ticks are keyed by field reference
// (G.age, E.otherEstate, S.burnShare) and record the value checked; asset ticks are keyed by a fingerprint of the row,
// with #k for the k-th of several identical rows (inputRegister.assetTickKey).
export const MAX_AUDIT_TICKS = 2_000;
const AUDIT_TICK_KEY = /^(?:[GES]\.[A-Za-z]{1,40}|A:[0-9a-f]{8}(?:#[1-9][0-9]{0,2})?)$/;
const AUDIT_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Stable unique id for asset rows; falls back when crypto.randomUUID is unavailable (non-secure http). */
export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const STRING_FIELDS = {
  grantor: ['age', 'deathYear', 'spouseAge', 'spouseDeathYear', 'fedOrd', 'stateOrd', 'niit', 'fedLtcg', 'stateLtcg'],
  estate: ['otherEstate', 'otherEstateGrowth', 'exclusion', 'exclusionIndexing', 'priorGifts', 'priorGiftYear', 'priorGiftExclusion',
    'spousePriorGifts', 'spousePriorGiftYear', 'spousePriorGiftExclusion',
    'estateTaxRate', 'beneFedLtcg', 'beneStateLtcg', 'yearsToSale', 'discountRate', 'maxYears'],
  settings: ['swapBasisPct', 'swapGrowth', 'swapYield', 'swapTaxRate', 'burnShare', 'ingFedOrd', 'ingFedLtcg', 'ingStateRate', 'ingAdminRate'],
  asset: ['name', 'source', 'fmv', 'discount', 'basis', 'growth', 'yield', 'saleYear', 'postSaleGrowth', 'postSaleYield', 'annualExclusions'],
};
const BOOL_FIELDS = {
  grantor: ['useDeathYear', 'married', 'portability'],
  estate: ['beneNiit'],
  settings: ['discountAtDeath', 'saleAppliesToBaseline', 'swapCustom', 'ingStateTaxOnGrantor'],
  asset: [],
};
const ENUM_FIELDS = {
  grantor: { sex: ['male', 'female'], spouseSex: ['male', 'female'], lifeTable: LIFE_TABLES.map((t) => t.id) },
  estate: { priorExclusionMode: ['year', 'custom'], spousePriorExclusionMode: ['year', 'custom'] },
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
    if (v !== undefined) out[key] = v.slice(0, MAX_TEXT_FIELD_LENGTH);
  }
  for (const key of BOOL_FIELDS[kind]) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  for (const [key, allowed] of Object.entries(ENUM_FIELDS[kind])) {
    if (allowed.includes(raw[key])) out[key] = raw[key];
  }
  return out;
}

/** Reviewer initials and ticks from an imported file: known key shapes only, strings capped, count capped. */
export function coerceAudit(raw) {
  const out = { reviewer: '', ticks: {} };
  if (!isPlainObject(raw)) return out;
  if (typeof raw.reviewer === 'string') out.reviewer = raw.reviewer.slice(0, 80);
  if (!isPlainObject(raw.ticks)) return out;
  let count = 0;
  for (const [key, tick] of Object.entries(raw.ticks)) {
    if (count >= MAX_AUDIT_TICKS) break;
    if (!AUDIT_TICK_KEY.test(key) || !isPlainObject(tick)) continue;
    const clean = {};
    if (typeof tick.v === 'string') clean.v = tick.v.slice(0, MAX_TEXT_FIELD_LENGTH);
    if (typeof tick.at === 'string' && AUDIT_DATE.test(tick.at)) clean.at = tick.at;
    out.ticks[key] = clean;
    count += 1;
  }
  return out;
}

export function serializeScenario({ grantor, estate, settings, assets, audit }) {
  const hasAudit = audit && (audit.reviewer || Object.keys(audit.ticks ?? {}).length);
  return JSON.stringify({ version: SCENARIO_VERSION, savedAt: new Date().toISOString(), grantor, estate, settings, assets, ...(hasAudit ? { audit } : {}) }, null, 2);
}

/** Returns { grantor, estate, settings, assets, audit, dropped } or throws with a readable message. */
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
    audit: coerceAudit(obj.audit),
    dropped,
  };
}

/**
 * CSV cell: numbers raw; strings quoted when needed and formula-leading text neutralised (CWE-1236). A cell holding a
 * semicolon or a tab is quoted too: Excel in locales whose list separator is ';' splits unquoted cells on it, which
 * would let a later fragment start with = and run as a formula.
 */
export function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  let quote = /[",;\t\r\n]/.test(s);
  if (/^[=+\-@\t\r]/.test(s)) { s = `'${s}`; quote = true; }
  return quote ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rankingToCsv(ranked) {
  const header = ['Rank', 'Asset', 'Mortality', 'Life table', 'Taxable gift', 'Exclusion used', 'Gift tax paid', 'NPV no swap', 'Optimal swap year', 'NPV optimal swap',
    'NPV per $ taxable gift (opt)', 'NPV per $ taxable gift (none)', 'NPV per $ FMV (opt)', 'Deathbed-swap value', 'Expected death year',
    'Cumulative taxable gift', 'Freeze (opt)', 'Tax burn (opt)', 'Gift tax (opt)', 'Residual (opt)', 'Step-up (opt)',
    'NPV ING', 'ING minus IDGT (best swap)', 'ING minus IDGT (no swap)', 'Structure', 'ING state saving (net)', 'ING location (net)', 'ING fee (net)', 'ING step-up'];
  const lines = [header.map(csvCell).join(',')];
  for (const row of ranked) {
    const r = row.result;
    const c = r.components.opt;
    const mortality = row.inputs?.deathYearOverride != null
      ? `assumed death year${r.derived.married ? 's' : ''}`
      : (r.derived.married ? 'married, second death' : 'single life');
    const table = row.inputs?.lifeTableId ? LIFE_TABLE_BY_ID[row.inputs.lifeTableId]?.shortLabel ?? '' : '';
    lines.push([row.rank, row.name, mortality, table, r.derived.Ug, r.derived.Uc, r.derived.G, r.npvNone, r.sStar === 0 ? 'none' : r.sStar, r.npvOpt,
      r.eff.opt, r.eff.none, r.effPerFMV.opt, r.npvPF, r.derived.expectedDeathYear, row.cumulativeTaxableGift,
      c.freeze, c.burn, c.giftTax, c.resid, c.stepUp,
      ...(row.ing
        ? [row.ing.npv, row.ing.vsIdgt.deltaOpt, row.ing.vsIdgt.deltaNone, row.ing.vsIdgt.verdict,
          row.ing.components.ssNet, row.ing.components.locNet, row.ing.components.feeNet, row.ing.components.stepUp]
        : [null, null, null, null, null, null, null, null])].map(csvCell).join(','));
  }
  return lines.join('\n');
}
