// Inputs audit register (docs/changes/2026-09-28-inputs-audit/plan.md): it lists every UI field exactly once, shows
// exactly the values the engine uses, and its flags, totals, ticks and exports behave as documented.
import { describe, it, expect } from 'vitest';
import {
  buildInputRegister, HOUSEHOLD_FIELDS, ASSET_FIELDS, ASSET_COLUMNS, assetFingerprint, assetTableRows, assetTableTsv, registerToCsv,
} from '../inputRegister.js';
import { DEFAULT_GRANTOR, DEFAULT_ESTATE, DEFAULT_SETTINGS, DEFAULT_ASSETS, makeAsset } from '../defaults.js';
import { buildEngineInputs } from '../buildInputs.js';
import { computeModel } from '../computeModel.js';
import { serializeScenario, parseScenario } from '../scenarioIO.js';
import { deriveGift } from '../../engine/fedTax.js';

const single = () => ({ grantor: { ...DEFAULT_GRANTOR }, estate: { ...DEFAULT_ESTATE }, settings: { ...DEFAULT_SETTINGS }, assets: DEFAULT_ASSETS() });
const married = () => ({
  grantor: { ...DEFAULT_GRANTOR, married: true, useDeathYear: true, deathYear: '12', spouseDeathYear: '4', portability: false },
  estate: { ...DEFAULT_ESTATE, priorGifts: '14000000', priorGiftYear: '2025', spousePriorGifts: '3000000', spousePriorExclusionMode: 'custom', spousePriorGiftExclusion: '12920000' },
  settings: { ...DEFAULT_SETTINGS, swapCustom: true, swapBasisPct: '60', swapGrowth: '5', swapYield: '1', swapTaxRate: '40', burnShare: '70' },
  assets: DEFAULT_ASSETS(),
});
const withModel = (st) => ({ ...st, perAsset: computeModel(st).perAsset });
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Object.is(a, b) || Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)) : a === b);

describe('the register lists every input exactly once', () => {
  it('every grantor, estate and settings field of the app state has one household row, and no row is stale', () => {
    const want = [
      ...Object.keys(DEFAULT_GRANTOR).map((k) => `grantor.${k}`),
      ...Object.keys(DEFAULT_ESTATE).map((k) => `estate.${k}`),
      ...Object.keys(DEFAULT_SETTINGS).map((k) => `settings.${k}`),
    ].sort();
    const got = HOUSEHOLD_FIELDS.map((f) => `${f.state}.${f.key}`).sort();
    expect(got).toEqual(want);
  });
  it('every asset field (all but the row id) has one register column, in a stable lettered order', () => {
    expect(ASSET_FIELDS.map((f) => f.key).sort()).toEqual(Object.keys(makeAsset()).filter((k) => k !== 'id').sort());
    expect(ASSET_COLUMNS.map((c) => c.letter).join('')).toBe('ABCDEFGHIJKLMNOPQR');
    expect(ASSET_COLUMNS.find((c) => c.letter === 'D').key).toBe('fmv');
  });
  it('every engine input is traceable to a register row (a new engine input cannot go unlisted)', () => {
    const mapped = new Set([...HOUSEHOLD_FIELDS, ...ASSET_FIELDS].map((f) => f.engine).filter(Boolean));
    const derived = new Set(['tauOrd', 'tauCg', 'tauBene', 'XP', 'XPS']); // the "Derived model inputs" rows
    const tables = new Set(['lx', 'lxSpouse']); // the columns of the chosen table: listed as life table + sex
    const inputs = buildEngineInputs({ ...married(), asset: married().assets[0] });
    for (const key of Object.keys(inputs)) expect(mapped.has(key) || derived.has(key) || tables.has(key), key).toBe(true);
  });
});

describe('model values are the engine inputs', () => {
  for (const [name, make] of [['single, life table', single], ['married, assumed deaths, prior gifts, custom swap', married]]) {
    it(name, () => {
      const st = make();
      const reg = buildInputRegister(withModel(st));
      const base = buildEngineInputs({ ...st, asset: st.assets[0] });
      for (const row of reg.household) {
        const f = HOUSEHOLD_FIELDS.find((x) => x.key === row.key && x.section === row.section);
        if (f.engine) expect(same(row.model, base[f.engine]), row.ref).toBe(true);
      }
      reg.assets.forEach((r, i) => {
        const inp = buildEngineInputs({ ...st, asset: st.assets[i] });
        for (const f of ASSET_FIELDS) if (f.engine) expect(same(r.cells[f.key].model, inp[f.engine]), `${r.ref}.${f.key}`).toBe(true);
        const g = deriveGift(inp);
        expect(r.derived.taxableGift).toBe(g.Ug); // the same U_g the engine prices
        expect(r.derived.giftValue).toBeCloseTo(inp.FMV * (1 - inp.delta), 6);
        expect(r.derived.unrealizedGain).toBe(inp.FMV - inp.B0);
      });
      expect(reg.derived.find((d) => d.ref === 'D.tauOrd').model).toBe(base.tauOrd);
    });
  }
});

describe('control totals and the balance-sheet tie-out', () => {
  it('sum the columns, count the rows, and report values that do not parse instead of hiding them', () => {
    const st = single();
    st.assets[1] = { ...st.assets[1], basis: 'n/a' };
    const reg = buildInputRegister(withModel(st));
    expect(reg.totals.count).toBe(3);
    expect(reg.totals.FMV).toEqual({ sum: 9_000_000, skipped: 0 });
    expect(reg.totals.B0).toEqual({ sum: 700_000, skipped: 1 });
    expect(reg.totals.taxableGift.sum).toBeCloseTo(1_000_000 + 2_100_000 + 3_750_000, 6);
    expect(reg.tieOut).toEqual({ otherEstate: 20_000_000, candidates: 9_000_000, total: 29_000_000 });
    expect(reg.assets.map((r) => r.derived.share)).toEqual([1 / 9, 3 / 9, 5 / 9]);
  });
});

describe('data-entry flags', () => {
  const codesFor = (patch, field) => {
    const st = single();
    st.assets[0] = { ...st.assets[0], ...patch };
    const reg = buildInputRegister(withModel(st));
    return reg.assets[0].cells[field].flags.map((f) => f.code);
  };
  it('a percentage typed as a decimal: flagged for rates, and for returns only when it looks like Excel (0.07, not 0.25 or 0.5)', () => {
    expect(codesFor({ growth: '0.07' }, 'growth')).toContain('PCT_AS_FRACTION');
    expect(codesFor({ discount: '0.3' }, 'discount')).toContain('PCT_AS_FRACTION');
    expect(codesFor({ yield: '0.25' }, 'yield')).not.toContain('PCT_AS_FRACTION');
    expect(codesFor({ growth: '0.5' }, 'growth')).not.toContain('PCT_AS_FRACTION');
    expect(codesFor({ growth: '7' }, 'growth')).toEqual([]);
  });
  it('commas and points that change the number', () => {
    expect(codesFor({ growth: '7,5' }, 'growth')).toContain('DECIMAL_COMMA');
    expect(codesFor({ fmv: '1,00,000' }, 'fmv')).toContain('IRREGULAR_GROUPING');
    expect(codesFor({ fmv: '1,000,000' }, 'fmv')).toEqual([]);
    expect(codesFor({ basis: '2.500' }, 'basis')).toContain('DOT_GROUPING');
    expect(codesFor({ fmv: '950' }, 'fmv')).toContain('SMALL_AMOUNT');
  });
  it('household rates, the ING fee, and validation errors land on the field a planner typed', () => {
    const st = single();
    st.grantor = { ...st.grantor, niit: '0.038', age: '65.5' };
    st.settings = { ...st.settings, ingAdminRate: '0.005' };
    const reg = buildInputRegister(withModel(st));
    const row = (ref) => reg.household.find((r) => r.ref === ref);
    expect(row('G.niit').flags.map((f) => f.code)).toContain('PCT_AS_FRACTION');
    expect(row('S.ingAdminRate').flags.map((f) => f.code)).toContain('PCT_AS_FRACTION');
    expect(row('G.age').flags.map((f) => f.code)).toContain('INVALID');
    expect(reg.flags[0].severity).toBe('error'); // worst first
  });
  it('duplicate names and duplicate figures, basis above value', () => {
    const st = single();
    st.assets.push({ ...st.assets[0], id: 'dup', source: 'Excel B9' });
    st.assets[1] = { ...st.assets[1], basis: '3500000' };
    const reg = buildInputRegister(withModel(st));
    const rowCodes = (i) => reg.assets[i].flags.map((f) => f.code);
    expect(rowCodes(0)).toEqual(expect.arrayContaining(['DUPLICATE_NAME', 'DUPLICATE_ROW']));
    expect(rowCodes(3)).toEqual(expect.arrayContaining(['DUPLICATE_NAME', 'DUPLICATE_ROW']));
    expect(rowCodes(1)).toContain('BASIS_ABOVE_FMV');
    expect(rowCodes(2)).toEqual([]);
  });
});

describe('what is in use', () => {
  it('post-sale rates only with a sale; spouse fields only when married; assumed years only in that mode; custom swap only when on', () => {
    const s1 = buildInputRegister(withModel(single()));
    const status = (reg, ref) => reg.household.find((r) => r.ref === ref).status.code;
    expect(s1.assets[0].cells.postSaleGrowth.status.code).toBe('unused');
    expect(s1.assets[2].cells.postSaleGrowth.status.code).toBe('used');
    expect(status(s1, 'G.spouseAge')).toBe('unused');
    expect(status(s1, 'G.deathYear')).toBe('unused');
    expect(status(s1, 'S.swapGrowth')).toBe('unused');
    expect(status(s1, 'E.maxYears')).toBe('label');
    const m = buildInputRegister(withModel(married()));
    expect(status(m, 'G.spouseDeathYear')).toBe('used');
    expect(status(m, 'G.lifeTable')).toBe('unused');
    expect(status(m, 'G.age')).toBe('label');
    expect(status(m, 'E.spousePriorGiftExclusion')).toBe('used');
    expect(status(m, 'E.spousePriorGiftYear')).toBe('unused');
    expect(status(m, 'S.swapGrowth')).toBe('used');
  });
});

describe('ticks certify what was checked', () => {
  it('a household tick holds while the value is unchanged and clears when it changes', () => {
    const st = single();
    const ticks = { 'E.otherEstate': { v: '20000000', at: '2026-09-28' } };
    expect(buildInputRegister({ ...st, audit: { ticks } }).household.find((r) => r.ref === 'E.otherEstate').verified).toBe(true);
    st.estate = { ...st.estate, otherEstate: '21000000' };
    expect(buildInputRegister({ ...st, audit: { ticks } }).household.find((r) => r.ref === 'E.otherEstate').verified).toBe(false);
  });
  it('an asset tick covers the whole row: any edit, the source ref included, clears it', () => {
    const st = single();
    const key = `A:${assetFingerprint(st.assets[1])}`;
    const ticks = { [key]: { at: '2026-09-28' } };
    const reg = buildInputRegister({ ...st, audit: { ticks } });
    expect(reg.assets.map((r) => r.verified)).toEqual([false, true, false]);
    expect(reg.progress.verified).toBe(1);
    for (const field of ['fmv', 'growth', 'source', 'name']) {
      const edited = { ...st, assets: st.assets.map((a, i) => (i === 1 ? { ...a, [field]: `${a[field]}x` } : a)) };
      expect(buildInputRegister({ ...edited, audit: { ticks } }).assets[1].verified, field).toBe(false);
    }
  });
  it('progress counts the rows in use plus every asset', () => {
    const reg = buildInputRegister(single());
    const inUse = reg.household.filter((r) => r.status.code === 'used' || r.status.code === 'scope').length;
    expect(reg.progress).toEqual({ verified: 0, total: inUse + 3 });
  });
});

describe('exports', () => {
  it('the CSV asset block is the on-screen register: letters, header, one row per asset, totals; typed vs model values', () => {
    const reg = buildInputRegister(withModel(single()));
    const typed = assetTableRows(reg, 'typed');
    const model = assetTableRows(reg, 'model');
    const col = (letter) => ASSET_COLUMNS.findIndex((c) => c.letter === letter);
    expect(typed.header.length).toBe(18);
    expect(typed.rows[0][col('H')]).toBe('7');
    expect(model.rows[0][col('H')]).toBe('0.07');
    expect(model.totals[col('D')]).toBe('9000000');
    expect(model.totals[col('O')]).toBe(String(reg.totals.taxableGift.sum));
    const csv = registerToCsv(reg, 'model', { reviewer: 'JW' }).split('\n');
    expect(csv[0].split(',')[col('D')]).toBe('Fair market value ($)');
    expect(csv[1].split(',')[col('D')]).toBe('1000000');
    expect(csv[4].startsWith(',Total (3 assets),')).toBe(true);
    expect(csv.some((l) => l.startsWith('G.age,Grantor,Age,65,yrs,used'))).toBe(true);
    expect(csv.at(-1)).toBe('Reviewer,JW');
  });
  it('text that a spreadsheet would run as a formula is neutralised in the CSV and the pasted table (CWE-1236)', () => {
    const st = single();
    st.assets[0] = { ...st.assets[0], name: '=HYPERLINK("http://x")', source: '+cmd' };
    const reg = buildInputRegister(st);
    expect(registerToCsv(reg, 'typed').split('\n')[1]).toContain(`"'=HYPERLINK(""http://x"")"`);
    const pasted = assetTableTsv(reg, 'typed').split('\n')[1].split('\t');
    expect(pasted[1]).toBe(`'=HYPERLINK("http://x")`);
    expect(pasted[2]).toBe("'+cmd");
  });
  it('ticks, the reviewer and source refs survive Export/Import JSON; unknown or malformed tick keys are dropped', () => {
    const st = single();
    st.assets[0] = { ...st.assets[0], source: 'Excel B7' };
    const audit = { reviewer: 'JW', ticks: { 'G.age': { v: '65', at: '2026-09-28' }, [`A:${assetFingerprint(st.assets[0])}`]: { at: '2026-09-28' } } };
    const text = serializeScenario({ ...st, audit });
    const obj = JSON.parse(text);
    obj.audit.ticks.__proto__polluted = { v: 'x' };
    obj.audit.ticks['A:not-hex'] = { at: '2026-09-28' };
    obj.audit.ticks['G.fedOrd'] = { v: '37', at: 'yesterday' };
    const back = parseScenario(JSON.stringify(obj), { grantor: DEFAULT_GRANTOR, estate: DEFAULT_ESTATE, settings: DEFAULT_SETTINGS, asset: makeAsset() });
    expect(back.assets[0].source).toBe('Excel B7');
    expect(back.audit.reviewer).toBe('JW');
    expect(Object.keys(back.audit.ticks).sort()).toEqual(['A:' + assetFingerprint(st.assets[0]), 'G.age', 'G.fedOrd'].sort());
    expect(back.audit.ticks['G.fedOrd']).toEqual({ v: '37' }); // a malformed date is dropped, not trusted
    const reg = buildInputRegister({ ...back, assets: back.assets, audit: back.audit });
    expect(reg.assets[0].verified).toBe(true); // fingerprints ignore the regenerated row id
    expect(serializeScenario({ ...st, audit: { reviewer: '', ticks: {} } })).not.toContain('"audit"');
  });
});
