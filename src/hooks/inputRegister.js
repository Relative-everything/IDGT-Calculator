// Inputs audit register (docs/changes/2026-09-28-inputs-audit/plan.md): every UI input listed systematically, as typed
// and as the model reads it, with whether it is in use, data-entry flags, and the reviewer's tick. Pure; no React.
//
// Model values are read from buildEngineInputs itself (or parsed with its own parsers), so the page can never show a
// value the engine does not use; the eval suite checks this on every scenario. The arithmetic (gift value, taxable gift,
// gain, control totals) is the engine's (engine/inputAudit.js).

import { buildEngineInputs, parseNum, parsePct, parseWhole } from './buildInputs.js';
import { csvCell } from './scenarioIO.js';
import { LIFE_TABLE_BY_ID } from '../data/lifeTables/index.js';
import { assetAuditFacts, controlTotals, shareOfTotal, balanceSheetTieOut, CENTS_PER_DOLLAR } from '../engine/inputAudit.js';

// Kinds: how a typed value is parsed and shown. Units are shown per display mode.
const UNIT = {
  money: { typed: '$', model: '$' },
  pct: { typed: '%', model: 'decimal' },
  int: { typed: 'yr', model: 'yr' },
  number: { typed: 'yrs', model: 'yrs' },
  bool: { typed: 'on/off', model: 'true/false' },
  enum: { typed: '', model: '' },
  text: { typed: '', model: '' },
};
const PARSE = { money: parseNum, pct: parsePct, int: parseWhole, number: parseNum, bool: (v) => Boolean(v), enum: (v) => v, text: (v) => v };

// Percent-typed-as-a-decimal checks (a common error when figures come from Excel, which stores 7% as 0.07):
//   rate    tax rates, discounts: any value strictly between 0 and 1 is implausible
//   share   shares of a whole (burn share, consideration basis), usually 100% or a large part of it: 0 < value ≤ 1,
//           so a 100% share pasted from Excel as 1 is caught too
//   return  growth, yield, indexing, discount rate: |value| < RETURN_FRACTION_LIMIT typed with two or more decimals
//           (0.07, 0.035; a 0.25% dividend yield or a 0.5% bond return is left alone)
//   fee     ING administration cost: 0 < value < FEE_FRACTION_LIMIT (typical fees are 0.25–1.5)
// Amounts typed in thousands: a fair market value or other estate between 0 and SMALL_AMOUNT_LIMIT dollars; and a whole
// schedule typed in thousands: the other estate and every fair market value below SMALL_SCHEDULE_SHARE of the basic
// exclusion (an estate that small has no use for an IDGT, so a schedule entirely below it is almost surely in $000s).
export const RETURN_FRACTION_LIMIT = 0.2;
export const FEE_FRACTION_LIMIT = 0.1;
export const SHARE_FRACTION_LIMIT = 1;
export const SMALL_AMOUNT_LIMIT = 1_000;
export const SMALL_SCHEDULE_SHARE = 0.01;

const used = () => ({ code: 'used' });
const unused = (why) => ({ code: 'unused', why });
const label = (why) => ({ code: 'label', why });
const scope = (why) => ({ code: 'scope', why });
const n = (v) => parseNum(v);

/**
 * Every household input (grantor, estate, settings state), in display order. `ref` prefixes follow the state section
 * (G. grantor, E. estate, S. settings) so a reference points at the same field in the scenario JSON. `engine` names the
 * buildEngineInputs key the field becomes, when it maps one to one.
 */
export const HOUSEHOLD_FIELDS = [
  // Grantor
  { section: 'Grantor', state: 'grantor', key: 'lifeTable', label: 'Life table', kind: 'enum', engine: 'lifeTableId',
    use: (s) => (s.grantor.useDeathYear ? unused('assumed death years are used') : used()) },
  { section: 'Grantor', state: 'grantor', key: 'age', label: 'Age', kind: 'int', unit: 'yrs', engine: 'age',
    use: (s) => (s.grantor.useDeathYear ? label('ages on the ledger rows only (assumed death years)') : used()) },
  { section: 'Grantor', state: 'grantor', key: 'sex', label: 'Sex (table column)', kind: 'enum', engine: null,
    use: (s) => (s.grantor.useDeathYear ? unused('assumed death years are used') : used()) },
  { section: 'Grantor', state: 'grantor', key: 'useDeathYear', label: 'Use assumed death years instead of the life table', kind: 'bool', engine: null, use: used },
  { section: 'Grantor', state: 'grantor', key: 'deathYear', label: 'Grantor dies at end of year', kind: 'int', engine: 'deathYearOverride',
    use: (s) => (s.grantor.useDeathYear ? used() : unused('the life table is used')) },
  { section: 'Grantor', state: 'grantor', key: 'fedOrd', label: 'Federal ordinary rate', kind: 'pct', engine: null, frac: 'rate', use: used },
  { section: 'Grantor', state: 'grantor', key: 'stateOrd', label: 'State ordinary rate', kind: 'pct', engine: 'stateOrd', frac: 'rate', use: used },
  { section: 'Grantor', state: 'grantor', key: 'niit', label: 'NIIT', kind: 'pct', engine: 'niit', frac: 'rate', use: used },
  { section: 'Grantor', state: 'grantor', key: 'fedLtcg', label: 'Federal LTCG rate', kind: 'pct', engine: null, frac: 'rate', use: used },
  { section: 'Grantor', state: 'grantor', key: 'stateLtcg', label: 'State LTCG rate', kind: 'pct', engine: 'stateCg', frac: 'rate', use: used },
  // Spouse (married couples)
  { section: 'Spouse', state: 'grantor', key: 'married', label: 'Married — estate tax at the second death', kind: 'bool', engine: 'married', use: used },
  { section: 'Spouse', state: 'grantor', key: 'spouseAge', label: "Spouse's age", kind: 'int', unit: 'yrs', engine: 'ageSpouse',
    use: (s) => (!s.grantor.married ? unused('single grantor') : s.grantor.useDeathYear ? label('ages on the ledger rows only (assumed death years)') : used()) },
  { section: 'Spouse', state: 'grantor', key: 'spouseSex', label: "Spouse's sex (table column)", kind: 'enum', engine: null,
    use: (s) => (!s.grantor.married ? unused('single grantor') : s.grantor.useDeathYear ? unused('assumed death years are used') : used()) },
  { section: 'Spouse', state: 'grantor', key: 'spouseDeathYear', label: 'Spouse dies at end of year', kind: 'int', engine: 'deathYearOverrideSpouse',
    use: (s) => (!s.grantor.married ? unused('single grantor') : s.grantor.useDeathYear ? used() : unused('the life table is used')) },
  { section: 'Spouse', state: 'grantor', key: 'portability', label: 'Elect portability at the first death', kind: 'bool', engine: 'portability',
    use: (s) => (s.grantor.married ? used() : unused('single grantor')) },
  { section: 'Spouse', state: 'estate', key: 'spousePriorGifts', label: "Spouse's prior taxable gifts", kind: 'money', engine: 'PS',
    use: (s) => (s.grantor.married ? used() : unused('single grantor')) },
  { section: 'Spouse', state: 'estate', key: 'spousePriorExclusionMode', label: "Spouse's gifts measured by: year or custom exclusion", kind: 'enum', engine: null,
    use: (s) => (!s.grantor.married ? unused('single grantor') : n(s.estate.spousePriorGifts) > 0 ? used() : unused('no spouse gifts')) },
  { section: 'Spouse', state: 'estate', key: 'spousePriorGiftYear', label: "Year of spouse's gifts", kind: 'int', unit: 'calendar year', engine: null,
    use: (s) => (!s.grantor.married ? unused('single grantor') : !(n(s.estate.spousePriorGifts) > 0) ? unused('no spouse gifts')
      : s.estate.spousePriorExclusionMode === 'custom' ? unused('custom exclusion entered') : used()) },
  { section: 'Spouse', state: 'estate', key: 'spousePriorGiftExclusion', label: "Spouse's gifts: exclusion when made (custom)", kind: 'money', engine: null,
    use: (s) => (!s.grantor.married ? unused('single grantor') : !(n(s.estate.spousePriorGifts) > 0) ? unused('no spouse gifts')
      : s.estate.spousePriorExclusionMode === 'custom' ? used() : unused('the year\'s exclusion is used')) },
  // Estate and exclusion
  { section: 'Estate and exclusion', state: 'estate', key: 'otherEstate', label: 'Other estate (excl. the candidate asset)', kind: 'money', engine: 'E0', small: true, use: used },
  { section: 'Estate and exclusion', state: 'estate', key: 'otherEstateGrowth', label: 'Other-estate growth (after tax)', kind: 'pct', engine: 'rE', frac: 'return', use: used },
  { section: 'Estate and exclusion', state: 'estate', key: 'exclusion', label: 'Basic exclusion (gift year)', kind: 'money', engine: 'X0', use: used },
  { section: 'Estate and exclusion', state: 'estate', key: 'exclusionIndexing', label: 'Exclusion indexing', kind: 'pct', engine: 'pi', frac: 'return', use: used },
  { section: 'Estate and exclusion', state: 'estate', key: 'estateTaxRate', label: 'Estate / gift tax rate', kind: 'pct', engine: 'tauE', frac: 'rate', use: used },
  { section: 'Estate and exclusion', state: 'estate', key: 'discountRate', label: 'Discount rate', kind: 'pct', engine: 'd', frac: 'return', use: used },
  { section: 'Estate and exclusion', state: 'estate', key: 'priorGifts', label: 'Prior taxable gifts (total)', kind: 'money', engine: 'P', use: used },
  { section: 'Estate and exclusion', state: 'estate', key: 'priorExclusionMode', label: 'Prior gifts measured by: year or custom exclusion', kind: 'enum', engine: null,
    use: (s) => (n(s.estate.priorGifts) > 0 ? used() : unused('no prior gifts')) },
  { section: 'Estate and exclusion', state: 'estate', key: 'priorGiftYear', label: 'Year of prior gifts', kind: 'int', unit: 'calendar year', engine: null,
    use: (s) => (!(n(s.estate.priorGifts) > 0) ? unused('no prior gifts') : s.estate.priorExclusionMode === 'custom' ? unused('custom exclusion entered') : used()) },
  { section: 'Estate and exclusion', state: 'estate', key: 'priorGiftExclusion', label: 'Prior gifts: exclusion when made (custom)', kind: 'money', engine: null,
    use: (s) => (!(n(s.estate.priorGifts) > 0) ? unused('no prior gifts') : s.estate.priorExclusionMode === 'custom' ? used() : unused('the year\'s exclusion is used')) },
  // Heirs
  { section: 'Heirs', state: 'estate', key: 'beneFedLtcg', label: "Heirs' federal LTCG rate", kind: 'pct', engine: null, frac: 'rate', use: used },
  { section: 'Heirs', state: 'estate', key: 'beneStateLtcg', label: "Heirs' state LTCG rate", kind: 'pct', engine: null, frac: 'rate', use: used },
  { section: 'Heirs', state: 'estate', key: 'beneNiit', label: "Add NIIT to the heirs' rate", kind: 'bool', engine: null, use: used },
  { section: 'Heirs', state: 'estate', key: 'yearsToSale', label: 'Years after death until sale', kind: 'number', engine: 'k', use: used },
  // Model settings
  { section: 'Model settings', state: 'settings', key: 'rankKey', label: 'Rank assets by', kind: 'enum', engine: null, use: () => scope('ranking order only') },
  { section: 'Model settings', state: 'settings', key: 'discountAtDeath', label: 'Include a discounted interest at its discounted value at death', kind: 'bool', engine: 'discountAtDeath',
    use: () => scope('affects assets with a valuation discount') },
  { section: 'Model settings', state: 'settings', key: 'saleAppliesToBaseline', label: 'A scheduled sale also happens if the asset is kept', kind: 'bool', engine: 'saleAppliesToBaseline',
    use: () => scope('affects assets with a sale year') },
  { section: 'Model settings', state: 'settings', key: 'burnShare', label: 'Share of trust income tax the grantor bears', kind: 'pct', engine: 'burnShare', frac: 'share', use: used },
  { section: 'Model settings', state: 'estate', key: 'maxYears', label: 'Table display horizon', kind: 'int', unit: 'yrs', engine: 'NDisp', use: () => label('ledger display only; NPVs use every year') },
  // Swap consideration
  { section: 'Swap consideration', state: 'settings', key: 'swapCustom', label: 'Customise the consideration', kind: 'bool', engine: null, use: used },
  { section: 'Swap consideration', state: 'settings', key: 'swapBasisPct', label: 'Consideration basis (% of value)', kind: 'pct', engine: 'bSw', frac: 'share',
    use: (s) => (s.settings.swapCustom ? used() : unused('neutral default consideration')) },
  { section: 'Swap consideration', state: 'settings', key: 'swapGrowth', label: 'Consideration appreciation', kind: 'pct', engine: 'gSw', frac: 'return',
    use: (s) => (s.settings.swapCustom ? used() : unused('neutral default consideration')) },
  { section: 'Swap consideration', state: 'settings', key: 'swapYield', label: 'Consideration gross yield', kind: 'pct', engine: 'ySw', frac: 'return',
    use: (s) => (s.settings.swapCustom ? used() : unused('neutral default consideration')) },
  { section: 'Swap consideration', state: 'settings', key: 'swapTaxRate', label: 'Grantor rate on the consideration yield', kind: 'pct', engine: 'tauSw', frac: 'rate',
    use: (s) => (s.settings.swapCustom ? used() : unused('neutral default consideration')) },
  // ING comparison
  { section: 'ING comparison', state: 'settings', key: 'ingFedOrd', label: 'Trust federal ordinary rate', kind: 'pct', engine: 'ingFedOrd', frac: 'rate', use: () => scope('ING comparison only') },
  { section: 'ING comparison', state: 'settings', key: 'ingFedLtcg', label: 'Trust federal LTCG rate', kind: 'pct', engine: 'ingFedLtcg', frac: 'rate', use: () => scope('ING comparison only') },
  { section: 'ING comparison', state: 'settings', key: 'ingStateRate', label: 'State rate the ING bears', kind: 'pct', engine: 'ingStateRate', frac: 'rate', use: () => scope('ING comparison only') },
  { section: 'ING comparison', state: 'settings', key: 'ingAdminRate', label: 'Administration cost', kind: 'pct', engine: 'ingAdminRate', frac: 'fee', use: () => scope('ING comparison only') },
  { section: 'ING comparison', state: 'settings', key: 'ingStateTaxOnGrantor', label: "Home state taxes the grantor on the ING's income (NY, CA)", kind: 'bool', engine: 'ingStateTaxOnGrantor',
    use: () => scope('ING comparison only') },
];

/** Every asset input, in register (and CSV) column order. */
export const ASSET_FIELDS = [
  { key: 'name', label: 'Asset', kind: 'text', engine: null },
  { key: 'source', label: 'Source ref', kind: 'text', engine: null },
  { key: 'fmv', label: 'Fair market value', kind: 'money', engine: 'FMV', small: true },
  { key: 'basis', label: 'Cost basis', kind: 'money', engine: 'B0' },
  { key: 'discount', label: 'Valuation discount', kind: 'pct', engine: 'delta', frac: 'rate' },
  { key: 'annualExclusions', label: 'Annual exclusions applied', kind: 'money', engine: 'annualExclusions' },
  { key: 'growth', label: 'Appreciation', kind: 'pct', engine: 'g', frac: 'return' },
  { key: 'yield', label: 'Income yield', kind: 'pct', engine: 'y', frac: 'return' },
  { key: 'saleYear', label: 'Sale year', kind: 'int', unit: 'yr; 0 = never', engine: 'S' },
  { key: 'postSaleGrowth', label: 'Post-sale appreciation', kind: 'pct', engine: 'gr', frac: 'return', saleOnly: true },
  { key: 'postSaleYield', label: 'Post-sale yield', kind: 'pct', engine: 'yr', frac: 'return', saleOnly: true },
];

/** Derived facts per asset (engine/inputAudit.js), after the typed columns. */
export const ASSET_DERIVED = [
  { key: 'unrealizedGain', label: 'Unrealized gain', kind: 'money' },
  { key: 'giftValue', label: 'Gift value after discount', kind: 'money' },
  { key: 'taxableGift', label: 'Taxable gift', kind: 'money' },
  { key: 'share', label: 'Share of Σ FMV', kind: 'ratio' },
];

/**
 * Asset register columns with their spreadsheet letters. The CSV and the copied table use the same order, so a column
 * keeps its letter in the file; asset #n is on row n + 1 there (row 1 is the header).
 */
export const ASSET_COLUMNS = [
  { key: 'row', label: '#' },
  ...ASSET_FIELDS.map((f) => ({ key: f.key, label: f.label, kind: f.kind, field: f })),
  ...ASSET_DERIVED.map((f) => ({ key: f.key, label: f.label, kind: f.kind, derived: true })),
  { key: 'flags', label: 'Flags' },
  { key: 'verified', label: 'Verified' },
].map((c, i) => ({ ...c, letter: String.fromCharCode(65 + i) }));

// Engine keys that validation may report, mapped back to every field a planner types that feeds them (for flags): a
// combined rate is wrong because one of its parts is, so the error shows on each part.
const ENGINE_TO_FIELDS = {
  tauOrd: ['fedOrd', 'stateOrd', 'niit'],
  tauCg: ['fedLtcg', 'stateLtcg', 'niit'],
  tauBene: ['beneFedLtcg', 'beneStateLtcg'], // + the NIIT toggle and rate when it is on (householdFieldsFor)
  lx: ['lifeTable', 'sex'],
  lxSpouse: ['lifeTable', 'spouseSex'],
};
for (const f of HOUSEHOLD_FIELDS) if (f.engine) ENGINE_TO_FIELDS[f.engine] ??= [f.key];
const HOUSEHOLD_KEYS = new Set(HOUSEHOLD_FIELDS.map((f) => f.key));
const ASSET_ENGINE_TO_FIELD = Object.fromEntries(ASSET_FIELDS.filter((f) => f.engine).map((f) => [f.engine, f.key]));
const ASSET_KEYS = new Set(ASSET_FIELDS.map((f) => f.key));

/** The household fields an engine-level error belongs to, given the modes that decide which field is in use. */
function householdFieldsFor(engineKey, estate) {
  // The prior-gift exclusion comes from the year's table entry, or from the custom amount (buildInputs.priorGiftExclusion)
  if (engineKey === 'XP') return [estate.priorExclusionMode === 'custom' ? 'priorGiftExclusion' : 'priorGiftYear'];
  if (engineKey === 'XPS') return [estate.spousePriorExclusionMode === 'custom' ? 'spousePriorGiftExclusion' : 'spousePriorGiftYear'];
  if (engineKey === 'tauBene' && estate.beneNiit) return [...ENGINE_TO_FIELDS.tauBene, 'beneNiit', 'niit'];
  if (ENGINE_TO_FIELDS[engineKey]) return ENGINE_TO_FIELDS[engineKey];
  return HOUSEHOLD_KEYS.has(engineKey) ? [engineKey] : [];
}

/** FNV-1a 32-bit hash, hex: a short fingerprint of what a tick covered. */
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Fingerprint of an asset row's typed values (name and source ref included): any edit changes it. */
export function assetFingerprint(asset) {
  return fnv1a(JSON.stringify(ASSET_FIELDS.map((f) => String(asset[f.key] ?? ''))));
}

/**
 * Tick keys. A household tick is keyed by the field reference and records the typed value it certified. An asset tick is
 * keyed by the row's content: the fingerprint, plus `#k` for the k-th row with that same content, so two identical rows
 * (a double entry) need a tick each. Content keys survive reordering, deletion of other rows and Export/Import JSON.
 */
export const householdTickKey = (f) => `${f.state[0].toUpperCase()}.${f.key}`;
export const assetTickKey = (asset, occurrence = 1) => `A:${assetFingerprint(asset)}${occurrence > 1 ? `#${occurrence}` : ''}`;
const typedString = (v) => (typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v ?? ''));
const isAuditable = (status) => status.code === 'used' || status.code === 'scope';

/** Tick key of every asset row, in order (occurrence-numbered among identical rows). */
function assetTickKeys(assets) {
  const seen = new Map();
  return assets.map((a) => {
    const fp = assetFingerprint(a);
    const k = (seen.get(fp) ?? 0) + 1;
    seen.set(fp, k);
    return { key: `A:${fp}${k > 1 ? `#${k}` : ''}`, fingerprint: fp };
  });
}

/**
 * The ticks that still certify the current inputs: household ticks on a row in use whose value is unchanged, and asset
 * ticks whose row still exists. A tick on a row that has changed is hidden on the page (it comes back if the edit is
 * undone) and left out here, so Export JSON saves only live ticks.
 * @returns {object} ticks, same shape as audit.ticks
 */
export function liveTicks({ grantor, estate, settings, assets }, ticks = {}) {
  const ui = { grantor, estate, settings };
  const out = {};
  for (const f of HOUSEHOLD_FIELDS) {
    const key = householdTickKey(f);
    const tick = ticks[key];
    if (tick && tick.v === typedString(ui[f.state][f.key]) && isAuditable(f.use(ui))) out[key] = tick;
  }
  for (const { key } of assetTickKeys(assets)) if (ticks[key]) out[key] = ticks[key];
  return out;
}

/** Whether a register row passes the page's row filter ('all', 'unverified', 'flagged'); unused rows are never unverified. */
export function matchesFilter(row, filter) {
  if (filter === 'unverified') return (row.status ? isAuditable(row.status) : true) && !row.verified;
  if (filter === 'flagged') return row.flags.length > 0;
  return true;
}

// ---- data-entry checks on the typed text -------------------------------------------------------------------------
const cleaned = (raw) => String(raw ?? '').replace(/[\s$%]/g, '');
const decimals = (raw) => { const m = /\.(\d+)$/.exec(cleaned(raw).replace(/,/g, '')); return m ? m[1].length : 0; };

/**
 * Keying checks on one typed value. On a field the model does not use at present, every flag is downgraded to 'confirm'
 * (it cannot change a result now, but would when the field comes into use) and an unreadable value is reported.
 */
function textFlags(field, raw, { unusedField = false } = {}) {
  const flags = [];
  if (typeof raw !== 'string' || raw.trim() === '') return flags;
  const text = cleaned(raw);
  const parsed = PARSE[field.kind](raw);
  if (unusedField && !Number.isFinite(parsed)) {
    flags.push({ code: 'NOT_A_NUMBER', severity: 'confirm', message: `"${raw}" is not ${field.kind === 'int' ? 'a whole number' : 'a number'}. Not used by the model at present.` });
  }
  if (field.kind === 'money') {
    if (field.small && parsed > 0 && parsed < SMALL_AMOUNT_LIMIT) {
      flags.push({ code: 'SMALL_AMOUNT', severity: 'check', message: `${parsed} dollars: if the source is in thousands, type ${parsed * 1000}.` });
    }
    if (text.includes(',') && !/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
      flags.push({ code: 'IRREGULAR_GROUPING', severity: 'check', message: `"${raw}" has commas that are not thousands separators; the model reads ${parseNum(raw)}.` });
    }
    if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
      flags.push({ code: 'DOT_GROUPING', severity: 'check', message: `"${raw}" looks like digit grouping with points; the model reads ${Number.isFinite(parseNum(raw)) ? parseNum(raw) : 'no number'}. Type ${text.replace(/\./g, '')} if that is the amount.` });
    }
  } else if (['pct', 'int', 'number'].includes(field.kind) && text.includes(',')) {
    flags.push({ code: 'DECIMAL_COMMA', severity: 'check', message: `"${raw}" contains a comma, read as a thousands separator: the model reads ${field.kind === 'pct' ? `${parseNum(raw)}%` : parseNum(raw)}. Use a decimal point.` });
  }
  if (field.kind === 'pct' && Number.isFinite(parsed)) {
    const v = parseNum(raw); // the typed number of percent
    const suspicious = (field.frac === 'rate' && v > 0 && v < 1)
      || (field.frac === 'share' && v > 0 && v <= SHARE_FRACTION_LIMIT)
      || (field.frac === 'return' && v !== 0 && Math.abs(v) < RETURN_FRACTION_LIMIT && decimals(raw) >= 2)
      || (field.frac === 'fee' && v > 0 && v < FEE_FRACTION_LIMIT);
    if (suspicious) {
      const asPct = Number((v * 100).toPrecision(10));
      flags.push({ code: 'PCT_AS_FRACTION', severity: 'check', message: `${raw} in a percent field is read as ${raw}%. If the source shows ${asPct}%, type ${asPct} (Excel stores ${asPct}% as ${v}).` });
    }
  }
  if (!unusedField) return flags;
  return flags.map((f) => (f.code === 'NOT_A_NUMBER' ? f : { ...f, severity: 'confirm', message: `${f.message} Not used by the model at present.` }));
}

const SEVERITY_ORDER = { error: 0, check: 1, confirm: 2 };
const byWeight = (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];

/**
 * The full register for the inputs audit page.
 * @param {{ grantor:object, estate:object, settings:object, assets:object[], perAsset?:object[], audit?:{ ticks?:object } }} state
 *   UI state; `perAsset` is the pipeline's per-asset result (computeModel) for validation errors and warnings. Pass the
 *   same snapshot of the inputs that produced `perAsset`, so the flags and the values always agree.
 * @returns {{ household:object[], derived:object[], assets:object[], totals:object, tieOut:object, flags:object[],
 *   progress:{ verified:number, total:number, hidden:number } }}
 */
export function buildInputRegister({ grantor, estate, settings, assets, perAsset = [], audit = {} }) {
  const ui = { grantor, estate, settings };
  const ticks = audit?.ticks ?? {};
  const inputsFor = (asset) => buildEngineInputs({ grantor, estate, settings, asset });
  const base = inputsFor(assets[0] ?? {});
  const rowOfId = new Map(assets.map((a, i) => [a.id, i + 1]));

  // Validation errors and input-related warnings from the pipeline, sorted to the fields a planner types.
  const householdIssues = {};
  const assetIssues = {};
  const pushUnique = (bucket, key, issue) => {
    bucket[key] ??= [];
    if (!bucket[key].some((x) => x.message === issue.message)) bucket[key].push(issue);
  };
  for (const pa of perAsset) {
    for (const e of pa.errors ?? []) {
      const issue = { code: 'INVALID', severity: 'error', message: e.message };
      const assetField = ASSET_KEYS.has(e.field) ? e.field : ASSET_ENGINE_TO_FIELD[e.field];
      if (assetField) { pushUnique(assetIssues, `${pa.id}.${assetField}`, issue); continue; }
      // A household-field error that also depends on this asset's inputs (validate.js `also`): shown on the asset's
      // first such cell, and named on the household row so several assets each get their own line.
      const alsoField = ASSET_ENGINE_TO_FIELD[e.also?.[0]];
      if (alsoField) pushUnique(assetIssues, `${pa.id}.${alsoField}`, issue);
      const row = rowOfId.get(pa.id);
      const message = alsoField ? `Asset ${row ? `#${row} ` : ''}${pa.name ?? ''}: ${e.message}` : e.message;
      const fields = householdFieldsFor(e.field, estate);
      if (fields.length) for (const f of fields) pushUnique(householdIssues, f, { ...issue, message });
      else pushUnique(householdIssues, '*', { ...issue, message: `${e.label ?? e.field}: ${message}` });
    }
    for (const w of pa.warnings ?? []) {
      if (w.code === 'SALE_BEYOND_HORIZON') pushUnique(assetIssues, `${pa.id}.saleYear`, { code: w.code, severity: 'confirm', message: `Sale year ${w.data?.S} is after the last modelled year (${w.data?.N}); the sale never happens.` });
      if (w.code === 'ZERO_TAXABLE_GIFT') pushUnique(assetIssues, `${pa.id}.annualExclusions`, { code: w.code, severity: 'confirm', message: 'The annual exclusions cover the whole gift: the taxable gift is 0.' });
      if (w.code === 'PRIOR_GIFT_TAX') pushUnique(householdIssues, 'priorGifts', { code: w.code, severity: 'confirm', message: 'Prior gifts exceed the exclusion of their year, so gift tax was paid on them: confirm against the gift tax returns (Form 709).' });
      if (w.code === 'SPOUSE_PRIOR_GIFT_TAX') pushUnique(householdIssues, 'spousePriorGifts', { code: w.code, severity: 'confirm', message: "The spouse's prior gifts exceed the exclusion of their year, so gift tax was paid: confirm against the spouse's Form 709s." });
    }
  }

  // Household rows
  const household = HOUSEHOLD_FIELDS.map((f) => {
    const raw = ui[f.state][f.key];
    const model = f.engine ? base[f.engine] : PARSE[f.kind](raw);
    const status = f.use(ui);
    const ref = householdTickKey(f);
    const typedChecks = f.kind === 'bool' || f.kind === 'enum' ? [] : textFlags(f, raw, { unusedField: status.code === 'unused' });
    const flags = [...(householdIssues[f.key] ?? []), ...typedChecks].sort(byWeight);
    const tick = ticks[ref];
    const tickValue = typedString(raw);
    return {
      ref, section: f.section, key: f.key, label: f.label, kind: f.kind, unit: f.unit ?? null, raw, model, status, flags,
      display: f.key === 'lifeTable' ? LIFE_TABLE_BY_ID[raw]?.shortLabel ?? raw : null,
      tickKey: ref, tickValue, verified: Boolean(tick) && tick.v === tickValue, tickedAt: tick?.at ?? null,
    };
  });

  // Model inputs that combine several fields: shown so the stacks and resolved exclusions can be checked too.
  const derived = [
    { ref: 'D.tauOrd', label: 'Grantor ordinary-income rate stack (federal + state + NIIT)', model: base.tauOrd, kind: 'pct' },
    { ref: 'D.tauCg', label: 'Grantor capital-gain rate stack (federal + state + NIIT)', model: base.tauCg, kind: 'pct' },
    { ref: 'D.tauBene', label: "Heirs' capital-gain rate (federal + state, + NIIT if ticked)", model: base.tauBene, kind: 'pct' },
    ...(n(estate.priorGifts) > 0 ? [{ ref: 'D.XP', label: 'Exclusion the prior gifts are measured against', model: base.XP, kind: 'money' }] : []),
    ...(grantor.married && n(estate.spousePriorGifts) > 0 ? [{ ref: 'D.XPS', label: "Exclusion the spouse's gifts are measured against", model: base.XPS, kind: 'money' }] : []),
  ];

  // Asset rows: typed values, model values (from the engine inputs), derived facts, flags, tick.
  const facts = assets.map((a) => {
    const inp = inputsFor(a);
    return { inp, ...assetAuditFacts({ FMV: inp.FMV, delta: inp.delta, annualExclusions: inp.annualExclusions, B0: inp.B0 }) };
  });
  // Duplicates are found on what the model reads (so "1,000,000" and "1000000" match), leaving out post-sale rates the
  // row does not use.
  const figuresKey = (inp) => JSON.stringify(ASSET_FIELDS.filter((f) => f.engine && !(f.saleOnly && !(inp.S > 0))).map((f) => String(inp[f.engine])));
  const nameCount = new Map();
  const valueRows = new Map();
  assets.forEach((a, i) => {
    const nameKey = String(a.name ?? '').trim().toLowerCase();
    if (nameKey) nameCount.set(nameKey, [...(nameCount.get(nameKey) ?? []), i + 1]);
    const valuesKey = figuresKey(facts[i].inp);
    valueRows.set(valuesKey, [...(valueRows.get(valuesKey) ?? []), i + 1]);
  });
  const totals = controlTotals(facts.map((f) => ({ FMV: f.inp.FMV, B0: f.inp.B0, annualExclusions: f.inp.annualExclusions, unrealizedGain: f.unrealizedGain,
    discountAmount: f.discountAmount, giftValue: f.giftValue, taxableGift: f.taxableGift })),
  ['FMV', 'B0', 'annualExclusions', 'unrealizedGain', 'discountAmount', 'giftValue', 'taxableGift'], { cents: true });
  const keys = assetTickKeys(assets);

  const assetRows = assets.map((a, i) => {
    const { inp, ...fact } = facts[i];
    const hasSale = inp.S > 0;
    const cells = {};
    for (const f of ASSET_FIELDS) {
      const raw = a[f.key] ?? '';
      const status = f.saleOnly && !hasSale ? unused('no sale year') : f.kind === 'text' ? label('label only') : used();
      const typedChecks = f.kind === 'text' ? [] : textFlags(f, raw, { unusedField: status.code === 'unused' });
      const flags = [...(assetIssues[`${a.id}.${f.key}`] ?? []), ...typedChecks].sort(byWeight);
      cells[f.key] = { raw, model: f.engine ? inp[f.engine] : raw, status, flags };
    }
    const rowFlags = [];
    if (Number.isFinite(inp.B0) && Number.isFinite(inp.FMV) && inp.B0 > inp.FMV) {
      rowFlags.push({ code: 'BASIS_ABOVE_FMV', severity: 'confirm', message: 'Basis exceeds fair market value (a built-in loss): confirm against the source; the model does not credit the loss.' });
    }
    const sameName = nameCount.get(String(a.name ?? '').trim().toLowerCase()) ?? [];
    if (sameName.length > 1) rowFlags.push({ code: 'DUPLICATE_NAME', severity: 'check', message: `Same name as asset ${sameName.filter((k) => k !== i + 1).map((k) => `#${k}`).join(', ')}.` });
    const sameValues = valueRows.get(figuresKey(inp)) ?? [];
    if (sameValues.length > 1) rowFlags.push({ code: 'DUPLICATE_ROW', severity: 'check', message: `Same figures as asset ${sameValues.filter((k) => k !== i + 1).map((k) => `#${k}`).join(', ')} — entered twice?` });
    const cellFlags = ASSET_FIELDS.flatMap((f) => cells[f.key].flags.map((x) => ({ ...x, field: f.key, fieldLabel: f.label })));
    const { key: tickKey, fingerprint } = keys[i];
    return {
      row: i + 1, id: a.id, ref: `A${i + 1}`, name: a.name ?? '', cells,
      derived: { ...fact, share: shareOfTotal(inp.FMV, totals.FMV.sum) },
      flags: [...cellFlags, ...rowFlags].sort(byWeight),
      tickKey, tickValue: fingerprint, verified: Boolean(ticks[tickKey]), tickedAt: ticks[tickKey]?.at ?? null,
    };
  });

  const tieOut = { ...balanceSheetTieOut({ otherEstate: base.E0, candidatesFmv: totals.FMV.sum }), candidatesSkipped: totals.FMV.skipped };

  // A whole schedule typed in thousands: every amount far below anything an IDGT is used for.
  const general = [...(householdIssues['*'] ?? [])];
  const smallLimit = SMALL_SCHEDULE_SHARE * base.X0;
  const amounts = [base.E0, ...facts.map((f) => f.inp.FMV)];
  if (Number.isFinite(smallLimit) && smallLimit > 0 && amounts.every((v) => Number.isFinite(v) && v > 0 && v < smallLimit)) {
    general.push({ code: 'SMALL_SCHEDULE', severity: 'check', message: `The other estate and every fair market value are below $${Math.round(smallLimit).toLocaleString('en-US')} (${SMALL_SCHEDULE_SHARE * 100}% of the basic exclusion). If the source schedule is in thousands, multiply each amount by 1,000.` });
  }

  // Every flag in one list for the summary, with its reference.
  const flags = [
    ...general.map((x) => ({ ...x, ref: 'General', where: 'Model' })),
    ...household.flatMap((r) => r.flags.map((x) => ({ ...x, ref: r.ref, where: r.label }))),
    ...assetRows.flatMap((r) => r.flags.map((x) => ({ ...x, ref: x.field ? `${r.ref}.${x.field}` : r.ref, where: `#${r.row} ${r.name}${x.fieldLabel ? ` · ${x.fieldLabel}` : ''}` }))),
  ].sort(byWeight);

  const auditable = household.filter((r) => isAuditable(r.status));
  const live = Object.keys(liveTicks({ grantor, estate, settings, assets }, ticks)).length;
  const progress = {
    verified: auditable.filter((r) => r.verified).length + assetRows.filter((r) => r.verified).length,
    total: auditable.length + assetRows.length,
    hidden: Object.keys(ticks).length - live, // ticks on rows that changed since, or are no longer in use
  };
  return { household, derived, assets: assetRows, totals, tieOut, flags, progress };
}

// ---- export ---------------------------------------------------------------------------------------------------------
/** Bare number for display and export: money to the cent, other values to 12 significant digits (no float noise). */
export function bare(value, kind) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value == null) return '';
  if (typeof value !== 'number') return String(value);
  if (!Number.isFinite(value)) return '';
  if (kind === 'money') return String(Math.round(value * CENTS_PER_DOLLAR) / CENTS_PER_DOLLAR);
  return String(Number(value.toPrecision(12)));
}

/** The value a cell shows in a mode: 'typed' (exactly as entered) or 'model' (as the engine reads it). */
export function cellValue(kind, raw, model, mode) {
  if (mode === 'typed') return kind === 'bool' ? (raw ? 'on' : 'off') : String(raw ?? '');
  return bare(model, kind);
}

/** Unit label for a kind in a mode. */
export function unitFor(kind, mode) {
  if (kind === 'ratio') return mode === 'typed' ? '%' : 'decimal';
  return UNIT[kind]?.[mode] ?? '';
}

// A derived value shown in "typed" mode keeps the typed convention for percentages (share of FMV in %).
const derivedValue = (d, key, kind, mode) => (kind === 'ratio' && mode === 'typed' && d[key] != null ? bare(d[key] * 100) : bare(d[key], kind));
export { derivedValue as derivedCellValue };

/**
 * Spreadsheet cell. A plain number in a numeric column stays a number. Text is formula-neutralised (CWE-1236: a leading
 * = + - @, or a leading quote that a spreadsheet would strip before reading the rest, gets a ' prefix), and so is text
 * that a spreadsheet would read as a number (a Source ref "0042" or a long account number would lose its zeros or
 * digits). CSV cells are quoted by csvCell; a pasted (tab-separated) cell that contains a quote is quoted the way Excel
 * writes the clipboard, so an unmatched quote cannot merge the rest of the table into one cell.
 */
function sheetCell(text, sep, isText = false) {
  const s = String(text ?? '');
  const numeric = /^-?\d+(\.\d+)?$/.test(s);
  if (numeric && !isText) return s;
  if (sep === ',') return numeric ? csvCell(`'${s}`) : csvCell(s);
  let flat = s.replace(/[\t\r\n]+/g, ' ');
  if (numeric || /^[=+\-@"]/.test(flat)) flat = `'${flat}`;
  return flat.includes('"') ? `"${flat.replace(/"/g, '""')}"` : flat;
}

/**
 * The asset register as rows of cells (header, one row per asset, totals), in column-letter order. The money totals foot
 * the rounded cells (control totals in whole cents), so SUM() over the pasted column equals the totals row exactly.
 * `textColumns[i]` is true for free-text columns (name, source ref), which are exported as text even when they look numeric.
 */
export function assetTableRows(register, mode) {
  const header = ASSET_COLUMNS.map((c) => {
    const unit = c.kind ? c.field?.unit ?? unitFor(c.kind, mode) : '';
    return unit && c.kind !== 'text' ? `${c.label} (${unit})` : c.label;
  });
  const rows = register.assets.map((r) => ASSET_COLUMNS.map((c) => {
    if (c.key === 'row') return String(r.row);
    if (c.key === 'flags') return r.flags.map((f) => f.code).join(' ');
    if (c.key === 'verified') return r.verified ? `yes ${r.tickedAt ?? ''}`.trim() : '';
    if (c.derived) return derivedValue(r.derived, c.key, c.kind, mode);
    const cell = r.cells[c.key];
    return c.kind === 'text' ? String(cell.raw ?? '') : cellValue(c.kind, cell.raw, cell.model, mode);
  }));
  const t = register.totals;
  const totalOf = { fmv: t.FMV, basis: t.B0, annualExclusions: t.annualExclusions, unrealizedGain: t.unrealizedGain, giftValue: t.giftValue, taxableGift: t.taxableGift };
  const totals = ASSET_COLUMNS.map((c) => {
    if (c.key === 'row') return '';
    if (c.key === 'name') return `Total (${t.count} assets)`;
    if (totalOf[c.key]) return bare(totalOf[c.key].sum, 'money');
    if (c.key === 'share') {
      const shares = register.assets.map((r) => r.derived.share).filter((v) => v != null);
      return shares.length ? derivedValue({ share: shares.reduce((a, b) => a + b, 0) }, 'share', 'ratio', mode) : '';
    }
    return '';
  });
  const textColumns = ASSET_COLUMNS.map((c) => c.kind === 'text');
  return { header, rows, totals, textColumns };
}

/** Tab-separated asset table for pasting next to a source spreadsheet. */
export function assetTableTsv(register, mode) {
  const { header, rows, totals, textColumns } = assetTableRows(register, mode);
  return [header.map((c) => sheetCell(c, '\t', true)).join('\t'),
    ...rows.map((cells) => cells.map((c, i) => sheetCell(c, '\t', textColumns[i])).join('\t')),
    totals.map((c) => sheetCell(c, '\t')).join('\t')].join('\n');
}

/**
 * One CSV with three blocks: the asset register (same columns as the page), control totals with the balance-sheet
 * tie-out, and the household register with the derived model inputs.
 */
export function registerToCsv(register, mode, meta = {}) {
  const lines = [];
  const row = (cells, textColumns = []) => lines.push(cells.map((c, i) => sheetCell(c, ',', textColumns[i])).join(','));
  const { header, rows, totals, textColumns } = assetTableRows(register, mode);
  row(header);
  rows.forEach((cells) => row(cells, textColumns));
  row(totals);
  lines.push('');
  const t = register.totals;
  row(['Control totals', 'Value', 'Values skipped (not a number)']);
  row(['Assets', String(t.count), '']);
  for (const [labelText, key] of [['Σ Fair market value', 'FMV'], ['Σ Cost basis', 'B0'], ['Σ Unrealized gain', 'unrealizedGain'], ['Σ Valuation discount', 'discountAmount'],
    ['Σ Gift value after discount', 'giftValue'], ['Σ Annual exclusions', 'annualExclusions'], ['Σ Taxable gift', 'taxableGift']]) {
    row([labelText, bare(t[key].sum, 'money'), String(t[key].skipped)]);
  }
  row(['Other estate', bare(register.tieOut.otherEstate, 'money'), '']);
  row(['+ Σ candidate FMV', bare(register.tieOut.candidates, 'money'), String(register.tieOut.candidatesSkipped)]);
  row(['Other estate + Σ candidate FMV (compare with net worth)', bare(register.tieOut.total, 'money'), String(register.tieOut.candidatesSkipped)]);
  lines.push('');
  row(['Ref', 'Section', 'Input', `Value (${mode === 'typed' ? 'as typed' : 'as the model reads it'})`, 'Unit', 'Status', 'Flags', 'Verified']);
  for (const r of register.household) {
    const status = r.status.why ? `${r.status.code}: ${r.status.why}` : r.status.code;
    row([r.ref, r.section, r.label, cellValue(r.kind, r.raw, r.model, mode), r.unit ?? unitFor(r.kind, mode), status, r.flags.map((f) => f.code).join(' '), r.verified ? `yes ${r.tickedAt ?? ''}`.trim() : '']);
  }
  for (const d of register.derived) row([d.ref, 'Derived model input', d.label, bare(d.model, d.kind), unitFor(d.kind, 'model'), 'derived', '', '']);
  if (meta.reviewer || meta.generatedAt) {
    lines.push('');
    if (meta.reviewer) row(['Reviewer', meta.reviewer], [false, true]);
    if (meta.generatedAt) row(['Generated', meta.generatedAt]);
  }
  return lines.join('\n');
}
