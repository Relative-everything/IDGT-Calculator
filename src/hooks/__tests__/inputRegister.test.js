// Inputs audit register (docs/changes/2026-09-28-inputs-audit/plan.md): it lists every UI field exactly once, shows
// exactly the values the engine uses, and its flags, totals, ticks and exports behave as documented.
import { describe, it, expect } from 'vitest';
import {
  buildInputRegister, HOUSEHOLD_FIELDS, ASSET_FIELDS, ASSET_COLUMNS, assetFingerprint, assetTickKey, assetTableRows, assetTableTsv, registerToCsv,
  liveTicks, matchesFilter, ticksForFile, ticksFromFile,
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
    expect(reg.tieOut).toEqual({ otherEstate: 20_000_000, candidates: 9_000_000, total: 29_000_000, candidatesSkipped: 0 });
    expect(reg.assets.map((r) => r.derived.share)).toEqual([1 / 9, 3 / 9, 5 / 9]);
    st.assets[2] = { ...st.assets[2], fmv: 'tbd' };
    expect(buildInputRegister(st).tieOut.candidatesSkipped).toBe(1); // the tie-out says a value was left out
  });
  it('money totals foot the cents shown on each row, so SUM() over the pasted column equals the totals row', () => {
    // Hand case: $1,000.01 at a 33.3% discount = $667.00667, shown as 667.01 on each of three rows. The rows foot to
    // 2001.03; the unrounded sum, 2001.02001, would print as 2001.02 and never tie to the pasted cells.
    const st = single();
    st.assets = [1, 2, 3].map((i) => makeAsset({ name: `Unit ${i}`, fmv: '1000.01', discount: '33.3', basis: '0' }));
    const reg = buildInputRegister(st);
    const t = assetTableRows(reg, 'model');
    const col = ASSET_COLUMNS.findIndex((c) => c.key === 'giftValue');
    expect(t.rows.map((r) => r[col])).toEqual(['667.01', '667.01', '667.01']);
    expect(t.totals[col]).toBe('2001.03');
    expect(reg.totals.giftValue.sum).toBe(2001.03);
    expect(t.totals[ASSET_COLUMNS.findIndex((c) => c.key === 'share')]).toBe('1'); // the shares shown, summed
    expect(assetTableRows(reg, 'typed').totals[ASSET_COLUMNS.findIndex((c) => c.key === 'share')]).toBe('100');
  });
  it('in both views every money total equals the sum of the cells shown above it (typed values with sub-cent digits too)', () => {
    const st = single();
    st.assets = [1, 2, 3].map((i) => makeAsset({ name: `Lot ${i}`, fmv: '1000.006', basis: '10.004', annualExclusions: '0.005', discount: '33.3' }));
    const reg = buildInputRegister(st);
    for (const mode of ['typed', 'model']) {
      const t = assetTableRows(reg, mode);
      for (const key of ['fmv', 'basis', 'annualExclusions', 'unrealizedGain', 'giftValue', 'taxableGift']) {
        const i = ASSET_COLUMNS.findIndex((c) => c.key === key);
        const sum = t.rows.reduce((a, r) => a + Number(r[i]), 0);
        expect(Number(t.totals[i]), `${mode} ${key}`).toBeCloseTo(sum, 9);
      }
    }
    expect(assetTableRows(reg, 'typed').totals[ASSET_COLUMNS.findIndex((c) => c.key === 'fmv')]).toBe('3000.018');
  });
  it('an "as typed" total keeps every digit the typed cells carry (to $10 billion with four decimals)', () => {
    const st = single();
    st.assets = [makeAsset({ name: 'Big', fmv: '12345678901.23' }), makeAsset({ name: 'A', fmv: '1' }), makeAsset({ name: 'B', fmv: '150000000.1234' })];
    const reg = buildInputRegister(st);
    const fmv = ASSET_COLUMNS.findIndex((c) => c.key === 'fmv');
    expect(assetTableRows(reg, 'typed').totals[fmv]).toBe('12495678902.3534');
    expect(assetTableRows(reg, 'model').totals[fmv]).toBe('12495678902.35');
    const csv = registerToCsv(reg, 'typed').split('\n');
    expect(csv.find((l) => l.startsWith('Σ Fair market value,'))).toBe('Σ Fair market value,12495678902.3534,0'); // the typed file agrees with its asset block
    expect(csv.find((l) => l.startsWith('Plus Σ candidate FMV,'))).toBe('Plus Σ candidate FMV,12495678902.3534,0'); // and so does its tie-out
    expect(csv.find((l) => l.startsWith('Other estate + Σ'))).toBe('Other estate + Σ candidate FMV (compare with net worth),12515678902.3534,0');
    expect(registerToCsv(reg, 'model').split('\n').find((l) => l.startsWith('Plus Σ candidate FMV,'))).toBe('Plus Σ candidate FMV,12495678902.35,0');
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
  it('duplicate figures are found on what the model reads: formatting and unused post-sale rates do not hide them', () => {
    const st = single();
    st.assets.push({ ...st.assets[0], id: 'dup', name: 'Other name', fmv: '1,000,000', postSaleGrowth: '9' });
    const reg = buildInputRegister(st);
    expect(reg.assets[3].flags.map((f) => f.code)).toContain('DUPLICATE_ROW');
    expect(reg.assets[3].flags.map((f) => f.code)).not.toContain('DUPLICATE_NAME');
  });
  it('a share typed as 1 (Excel for 100%) is flagged on the burn share and the consideration basis', () => {
    const st = single();
    st.settings = { ...st.settings, burnShare: '1', swapCustom: true, swapBasisPct: '1' };
    const reg = buildInputRegister(st);
    const codes = (ref) => reg.household.find((r) => r.ref === ref).flags.map((f) => f.code);
    expect(codes('S.burnShare')).toContain('PCT_AS_FRACTION');
    expect(codes('S.swapBasisPct')).toContain('PCT_AS_FRACTION');
    st.settings = { ...st.settings, burnShare: '70' };
    expect(buildInputRegister(st).household.find((r) => r.ref === 'S.burnShare').flags).toEqual([]);
  });
  it('a value the model does not use is still checked, as "confirm", and does not count toward the tab badge', () => {
    const st = single();
    st.grantor = { ...st.grantor, spouseAge: 'sixty' }; // single grantor: not used
    st.settings = { ...st.settings, swapGrowth: '0.07' }; // custom consideration off: not used
    const reg = buildInputRegister(withModel(st));
    const flags = (ref) => reg.household.find((r) => r.ref === ref).flags;
    expect(flags('G.spouseAge').map((f) => [f.code, f.severity])).toEqual([['NOT_A_NUMBER', 'confirm']]);
    expect(flags('S.swapGrowth').map((f) => [f.code, f.severity])).toEqual([['PCT_AS_FRACTION', 'confirm']]);
    expect(reg.flags.filter((f) => f.severity !== 'confirm')).toEqual([]);
  });
  it('a whole schedule typed in thousands is flagged once, even when no single amount is below $1,000', () => {
    const st = single();
    st.estate = { ...st.estate, otherEstate: '20000' };
    st.assets = st.assets.map((a) => ({ ...a, fmv: String(Number(a.fmv) / 1000), basis: String(Number(a.basis) / 1000) }));
    const reg = buildInputRegister(st);
    expect(reg.flags.filter((f) => f.code === 'SMALL_SCHEDULE').map((f) => f.ref)).toEqual(['General']);
    expect(reg.flags.some((f) => f.code === 'SMALL_AMOUNT')).toBe(false);
    expect(buildInputRegister(single()).flags.some((f) => f.code === 'SMALL_SCHEDULE')).toBe(false);
    // an asset schedule in $000s beside an other estate in dollars: a 'confirm'; an other estate of 0 does not hide it
    const mixed = { ...st, estate: { ...st.estate, otherEstate: '20000000' } };
    expect(buildInputRegister(mixed).flags.filter((f) => f.code === 'SMALL_SCHEDULE').map((f) => f.severity)).toEqual(['confirm']);
    const zero = { ...st, estate: { ...st.estate, otherEstate: '0' } };
    expect(buildInputRegister(zero).flags.filter((f) => f.code === 'SMALL_SCHEDULE').map((f) => f.severity)).toEqual(['check']);
  });
  it('an amount grouped with spaces is read by the model but flagged: a spreadsheet pastes it as text', () => {
    const st = single();
    st.assets[1] = { ...st.assets[1], fmv: '3 000 000' };
    st.assets[2] = { ...st.assets[2], fmv: '5\u00A0000\u00A0000' };
    const reg = buildInputRegister(st);
    expect(reg.assets[1].cells.fmv.model).toBe(3_000_000);
    expect(reg.assets[1].cells.fmv.flags.map((f) => [f.code, f.severity])).toEqual([['SPACE_GROUPING', 'confirm']]);
    expect(reg.assets[2].cells.fmv.flags.map((f) => f.code)).toEqual(['SPACE_GROUPING']);
    const flagOf = (fmv) => {
      const t = single();
      t.assets[0] = { ...t.assets[0], fmv };
      return buildInputRegister(t).assets[0].cells.fmv.flags.find((f) => f.code === 'SPACE_GROUPING');
    };
    expect(flagOf('3\u2009000\u2009000').severity).toBe('confirm'); // thin space, as PDFs copy it
    expect(flagOf('1000\t2000').severity).toBe('check'); // two cells pasted into one field
    const decimalComma = flagOf('1 234 567,89');
    expect(decimalComma.severity).toBe('check');
    expect(decimalComma.message).toContain('type 1234567.89'); // never "type 123456789", the 100× misreading
  });
  it('an unreadable other estate does not make the whole schedule look small', () => {
    const st = single();
    st.estate = { ...st.estate, otherEstate: '20M' };
    st.assets = [makeAsset({ name: 'Small', fmv: '120000' })];
    expect(buildInputRegister(st).flags.filter((f) => f.code === 'SMALL_SCHEDULE').map((f) => f.severity)).toEqual(['confirm']);
  });
  it('unreadable figures are compared as typed: "TBD" twice is a duplicate, "TBD" and "4M" are not', () => {
    const st = single();
    st.assets = [makeAsset({ name: 'A', fmv: 'TBD' }), makeAsset({ name: 'B', fmv: 'TBD' }), makeAsset({ name: 'C', fmv: '4M' })];
    const reg = buildInputRegister(st);
    expect(reg.assets.map((r) => r.flags.some((f) => f.code === 'DUPLICATE_ROW'))).toEqual([true, true, false]);
  });
  it('a value typed with its own % sign is not read as an Excel fraction', () => {
    const st = single();
    st.settings = { ...st.settings, burnShare: '1%' };
    expect(buildInputRegister(st).household.find((r) => r.ref === 'S.burnShare').flags).toEqual([]);
  });
  it('a sale year that reads as positive puts the post-sale rates in use, as the asset card and validation do', () => {
    const st = single();
    st.assets[0] = { ...st.assets[0], saleYear: '2.5', postSaleGrowth: '', postSaleYield: '' };
    const reg = buildInputRegister(withModel(st));
    expect(reg.assets[0].cells.postSaleGrowth.status.code).toBe('used');
    expect(reg.assets[0].cells.postSaleGrowth.flags.map((f) => f.code)).toContain('INVALID');
  });
});

describe('validation errors land on every field that feeds them', () => {
  const refsOf = (reg, code = 'INVALID') => [...new Set(reg.flags.filter((f) => f.code === code).map((f) => f.ref))].sort();
  it.each([
    ['an estate tax rate of 0', (st) => { st.estate.estateTaxRate = '0'; }, ['E.estateTaxRate']],
    ['a grantor ordinary stack of 100% or more: each part of it', (st) => { st.grantor.fedOrd = '99'; }, ['G.fedOrd', 'G.niit', 'G.stateOrd']],
    ["an heirs' rate stack of 100% or more, NIIT on", (st) => { st.estate.beneFedLtcg = '99'; }, ['E.beneFedLtcg', 'E.beneNiit', 'E.beneStateLtcg', 'G.niit']],
    ["an heirs' rate stack of 100% or more, NIIT off", (st) => { st.estate.beneFedLtcg = '99'; st.estate.beneNiit = false; st.estate.beneStateLtcg = '5'; }, ['E.beneFedLtcg', 'E.beneStateLtcg']],
    ['a negative basis', (st) => { st.assets[0].basis = '-1'; }, ['A1.basis']],
    ['a negative sale year', (st) => { st.assets[0].saleYear = '-2'; }, ['A1.saleYear']],
    ['a prior-gift year with no exclusion on file', (st) => { st.estate.priorGifts = '1000000'; st.estate.priorGiftYear = '1990'; }, ['E.priorGiftYear']],
    ['a negative basic exclusion with no prior gifts: once, on the exclusion (not on the unused prior-gift rows)', (st) => { st.estate.exclusion = '-5'; }, ['E.exclusion']],
    ['a negative federal rate: on the federal rate only (state and NIIT cancel in the bound it breaks)', (st) => { st.grantor.fedOrd = '-2'; }, ['G.fedOrd']],
    ['a negative federal LTCG rate', (st) => { st.grantor.fedLtcg = '-2'; }, ['G.fedLtcg']],
    ['a negative indexing rate below the $1M floor: the rate and the exclusion it indexes', (st) => { st.estate.exclusion = '1500000'; st.estate.exclusionIndexing = '-50'; }, ['E.exclusion', 'E.exclusionIndexing']],
    ['the trust stacks at 100% or more: the state rate the ING bears and NIIT too', (st) => { st.settings.ingStateRate = '99'; }, ['G.niit', 'S.ingFedLtcg', 'S.ingFedOrd', 'S.ingStateRate']],
    ['a negative custom prior-gift exclusion', (st) => { st.estate.priorGifts = '1000000'; st.estate.priorExclusionMode = 'custom'; st.estate.priorGiftExclusion = '-5'; }, ['E.priorGiftExclusion']],
  ])('%s', (_, patch, refs) => {
    const st = single();
    st.assets = [st.assets[0]];
    patch(st);
    expect(refsOf(buildInputRegister(withModel(st)))).toEqual(refs);
  });
  it('a negative federal rate is worded for the federal rate and hides no other error', () => {
    const st = single();
    st.assets = [st.assets[0]];
    st.grantor.fedOrd = '-2';
    st.assets[0].basis = '-1';
    const reg = buildInputRegister(withModel(st));
    expect(refsOf(reg)).toEqual(['A1.basis', 'G.fedOrd']);
    expect(reg.household.find((r) => r.ref === 'G.fedOrd').flags[0].message).toMatch(/^Federal ordinary rate is below 0%/);
  });
  it("a married spouse's negative custom prior-gift exclusion lands on that field", () => {
    const st = married();
    st.assets = [st.assets[0]];
    st.estate.spousePriorGiftExclusion = '-5';
    expect(refsOf(buildInputRegister(withModel(st)))).toEqual(['E.spousePriorGiftExclusion']);
  });
  it("a married spouse's negative age lands on the spouse's age", () => {
    const st = married();
    st.assets = [st.assets[0]];
    st.grantor.spouseAge = '-3';
    expect(refsOf(buildInputRegister(withModel(st)))).toEqual(['G.spouseAge']);
  });
  it("the ING value factor names the asset on the fee row, and shows on that asset's growth cell", () => {
    const st = single();
    st.settings.ingAdminRate = '1';
    st.assets[1] = { ...st.assets[1], growth: '-99.5', yield: '0' }; // 1 + g + y > 0 but the ING loses everything in a year
    const reg = buildInputRegister(withModel(st));
    expect(refsOf(reg)).toEqual(['A2.growth', 'S.ingAdminRate']);
    const fee = reg.household.find((r) => r.ref === 'S.ingAdminRate').flags.find((f) => f.code === 'INVALID');
    expect(fee.message.startsWith(`Asset #2 ${st.assets[1].name}: The ING would lose`)).toBe(true);
    // with a yield, the trust's ordinary stack is part of the factor too
    st.assets[1] = { ...st.assets[1], growth: '-99', yield: '2' };
    st.settings.ingAdminRate = '5';
    expect(refsOf(buildInputRegister(withModel(st)))).toEqual(['A2.growth', 'G.niit', 'S.ingAdminRate', 'S.ingFedOrd', 'S.ingStateRate']);
    // where growth plus yield is already -100% or less, only that error stands
    st.assets[1] = { ...st.assets[1], growth: '-100', yield: '0' };
    expect(refsOf(buildInputRegister(withModel(st)))).toEqual(['A2.growth']);
  });
  it('a sale after the horizon is a "confirm" on the sale year', () => {
    const st = single();
    st.assets[0] = { ...st.assets[0], saleYear: '60', postSaleGrowth: '5', postSaleYield: '1' };
    expect(refsOf(buildInputRegister(withModel(st)), 'SALE_BEYOND_HORIZON')).toEqual(['A1.saleYear']);
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
    // prior gifts: the year is in use in year mode, the custom exclusion in custom mode, neither without prior gifts
    const withPrior = (mode) => buildInputRegister({ ...single(), estate: { ...DEFAULT_ESTATE, priorGifts: '1000000', priorExclusionMode: mode, priorGiftExclusion: '5000000' } });
    expect([status(withPrior('year'), 'E.priorGiftYear'), status(withPrior('year'), 'E.priorGiftExclusion')]).toEqual(['used', 'unused']);
    expect([status(withPrior('custom'), 'E.priorGiftYear'), status(withPrior('custom'), 'E.priorGiftExclusion')]).toEqual(['unused', 'used']);
    expect([status(s1, 'E.priorGiftYear'), status(s1, 'E.priorExclusionMode')]).toEqual(['unused', 'unused']);
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
  it('an asset tick covers the whole row: any edit, the source ref included, hides it', () => {
    const st = single();
    const ticks = { [assetTickKey(st.assets[1])]: { v: assetFingerprint(st.assets[1]), at: '2026-09-28' } };
    const reg = buildInputRegister({ ...st, audit: { ticks } });
    expect(reg.assets.map((r) => r.verified)).toEqual([false, true, false]);
    expect(reg.progress.verified).toBe(1);
    for (const field of ['fmv', 'growth', 'source', 'name']) {
      const edited = { ...st, assets: st.assets.map((a, i) => (i === 1 ? { ...a, [field]: `${a[field]}x` } : a)) };
      const after = buildInputRegister({ ...edited, audit: { ticks } });
      expect(after.assets[1].verified, field).toBe(false);
      expect(after.progress.hidden, field).toBe(1);
    }
  });
  it('progress counts the rows in use plus every asset', () => {
    const reg = buildInputRegister(single());
    const inUse = reg.household.filter((r) => r.status.code === 'used' || r.status.code === 'scope').length;
    expect(reg.progress).toEqual({ verified: 0, total: inUse + 3, hidden: 0 });
  });
  describe('a tick stays with its row, even when another row is identical', () => {
    const twins = () => {
      const st = single();
      st.assets = [makeAsset({ name: 'LLC units', fmv: '500000' }), makeAsset({ name: 'LLC units', fmv: '500000' })];
      return st;
    };
    const tickOn = (asset) => ({ [assetTickKey(asset)]: { v: assetFingerprint(asset), at: '2026-09-28' } });
    const verified = (st, ticks) => buildInputRegister({ ...st, audit: { ticks } }).assets.map((r) => r.verified);
    it('ticking one twin does not verify the other', () => {
      const st = twins();
      expect(verified(st, tickOn(st.assets[0]))).toEqual([true, false]);
    });
    it('editing the ticked twin hides its tick and never passes it to the other', () => {
      const st = twins();
      const ticks = tickOn(st.assets[0]);
      const edited = { ...st, assets: [{ ...st.assets[0], name: 'LLC units - trust A' }, st.assets[1]] };
      expect(verified(edited, ticks)).toEqual([false, false]);
      expect(buildInputRegister({ ...edited, audit: { ticks } }).progress.hidden).toBe(1);
    });
    it('editing or deleting the other twin leaves the ticked one verified', () => {
      const st = twins();
      const ticks = tickOn(st.assets[1]);
      expect(verified({ ...st, assets: [{ ...st.assets[0], name: 'Renamed' }, st.assets[1]] }, ticks)).toEqual([false, true]);
      expect(verified({ ...st, assets: [st.assets[1]] }, ticks)).toEqual([true]);
    });
    it('deleting the ticked twin does not verify the one left', () => {
      const st = twins();
      expect(verified({ ...st, assets: [st.assets[1]] }, tickOn(st.assets[0]))).toEqual([false]);
    });
    it('Export/Import JSON keeps each twin\'s own tick (content keys numbered in file order)', () => {
      const st = twins();
      st.assets.push(makeAsset({ name: 'Other' }));
      const ticks = { ...tickOn(st.assets[1]), ...tickOn(st.assets[2]) };
      const file = ticksForFile(st, ticks);
      const fp = assetFingerprint(st.assets[0]);
      expect(Object.keys(file).sort()).toEqual([`A:${fp}#2`, `A:${assetFingerprint(st.assets[2])}`].sort());
      const text = serializeScenario({ ...st, audit: { reviewer: 'JW', ticks: file } });
      const back = parseScenario(text, { grantor: DEFAULT_GRANTOR, estate: DEFAULT_ESTATE, settings: DEFAULT_SETTINGS, asset: makeAsset() });
      expect(verified(back, ticksFromFile(back.assets, back.audit.ticks))).toEqual([false, true, true]);
    });
  });
  it('a tick on a changed row or a row no longer in use is hidden and counted; only live ticks are exported', () => {
    const st = single();
    const ticks = {
      'E.otherEstate': { v: '20000000', at: '2026-09-28' },
      'G.fedOrd': { v: '35', at: '2026-09-28' }, // value changed since (37 now)
      'G.spouseAge': { v: '62', at: '2026-09-28' }, // not in use for a single grantor
      ...{ [assetTickKey(st.assets[1])]: { v: assetFingerprint(st.assets[1]), at: '2026-09-28' } },
      'R:removed-row': { v: '0badf00d', at: '2026-09-28' }, // a row that no longer exists: not counted
    };
    const reg = buildInputRegister({ ...st, audit: { ticks } });
    expect(reg.progress.verified).toBe(2);
    expect(reg.progress.hidden).toBe(2);
    expect(Object.keys(liveTicks(st, ticks)).sort()).toEqual(['E.otherEstate', assetTickKey(st.assets[1])].sort());
  });
  it('a household row that is no longer in use is not verified anywhere: page, progress, CSV', () => {
    const st = married();
    st.estate = { ...st.estate, priorGifts: '5000000', priorExclusionMode: 'year', priorGiftYear: '2025' };
    const ticks = { 'E.priorGiftYear': { v: '2025', at: '2026-09-28' }, 'G.portability': { v: 'false', at: '2026-09-28' } };
    const before = buildInputRegister({ ...st, audit: { ticks } });
    expect(before.progress.verified).toBe(2);
    const after = buildInputRegister({ ...st, grantor: { ...st.grantor, married: false }, estate: { ...st.estate, priorGifts: '0' }, audit: { ticks } });
    expect(after.household.filter((r) => ['E.priorGiftYear', 'G.portability'].includes(r.ref)).map((r) => r.verified)).toEqual([false, false]);
    expect(after.progress).toMatchObject({ verified: 0, hidden: 2 });
    expect(registerToCsv(after, 'typed')).not.toMatch(/(G\.portability|E\.priorGiftYear),.*yes 2026/);
  });
  it('row filters: unverified leaves out rows not in use; flagged keeps any row with a flag', () => {
    expect(matchesFilter({ status: { code: 'unused' }, verified: false, flags: [] }, 'unverified')).toBe(false);
    expect(matchesFilter({ status: { code: 'scope' }, verified: false, flags: [] }, 'unverified')).toBe(true);
    expect(matchesFilter({ verified: true, flags: [] }, 'unverified')).toBe(false); // asset rows have no status
    expect(matchesFilter({ verified: true, flags: [{ code: 'X' }] }, 'flagged')).toBe(true);
    expect(matchesFilter({ verified: true, flags: [] }, 'all')).toBe(true);
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
    expect(pasted[1]).toBe(`"'=HYPERLINK(""http://x"")"`); // quoted as Excel writes the clipboard, then read as text
    expect(pasted[2]).toBe("'+cmd");
  });
  it('a pasted cell cannot start a formula behind a quote, merge the table, or lose a text reference\'s digits', () => {
    const st = single();
    st.assets[0] = { ...st.assets[0], name: '"=1+1"', source: '"abc' };
    st.assets[1] = { ...st.assets[1], name: 'x;=1+1;', source: '0042' };
    const reg = buildInputRegister(st);
    const lines = assetTableTsv(reg, 'typed').split('\n');
    expect(lines.length).toBe(1 + 3 + 1); // header, three rows, totals
    const [r1, r2] = [lines[1].split('\t'), lines[2].split('\t')];
    expect(r1[1]).toBe(`"'""=1+1"""`); // a leading quote is neutralised, and the cell is quoted so it parses back whole
    expect(r1[2]).toBe(`"'""abc"`); // an unmatched quote cannot open a cell that swallows the rest of the table
    expect(r2[2]).toBe("'0042"); // a Source ref stays text; a numeric column stays a number
    expect(r2[ASSET_COLUMNS.findIndex((c) => c.key === 'fmv')]).toBe('3000000');
    st.assets[2] = { ...st.assets[2], name: 'TRUE', source: ' 12/31' };
    const r3 = assetTableTsv(buildInputRegister(st), 'typed').split('\n')[3].split('\t');
    expect([r3[1], r3[2]]).toEqual(["'TRUE", "' 12/31"]); // a boolean word and a date-like reference stay text
    expect(assetTableTsv(buildInputRegister({ ...st, assets: [{ ...st.assets[0], source: "'quoted" }] }), 'typed').split('\n')[1].split('\t')[2]).toBe("''quoted");
    const csv = registerToCsv(reg, 'typed').split('\n')[2];
    expect(csv).toContain(`"x;'=1+1;"`); // quoted, and the fragment after ';' neutralised for a ';'-separator Excel
    expect(csv).toContain(",'0042,");
  });
  it('a signed or formatted number in a numeric column stays a number when pasted or opened (it cannot be a formula)', () => {
    const st = single();
    st.assets[0] = { ...st.assets[0], growth: '-2%', fmv: '+2,500,000', basis: '-$500' };
    const reg = buildInputRegister(st);
    const cells = assetTableTsv(reg, 'typed').split('\n')[1].split('\t');
    const at = (key) => cells[ASSET_COLUMNS.findIndex((c) => c.key === key)];
    expect([at('growth'), at('fmv'), at('basis')]).toEqual(['-2%', '+2,500,000', '-$500']);
    const csvRow = registerToCsv(reg, 'typed').split('\n')[1];
    expect(csvRow).toContain(',"+2,500,000",');
    expect(csvRow).toContain(',-2%,');
    // a formula-looking value in a numeric column is still neutralised
    st.assets[0] = { ...st.assets[0], growth: '-2+3+cmd|x' };
    expect(assetTableTsv(buildInputRegister(st), 'typed').split('\n')[1].split('\t')[ASSET_COLUMNS.findIndex((c) => c.key === 'growth')]).toBe("'-2+3+cmd|x");
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
    const reg = buildInputRegister({ ...back, audit: { ticks: ticksFromFile(back.assets, back.audit.ticks) } });
    expect(reg.assets[0].verified).toBe(true); // the file's content key is mapped onto the imported row's new id
    expect(serializeScenario({ ...st, audit: { reviewer: '', ticks: {} } })).not.toContain('"audit"');
  });
});
