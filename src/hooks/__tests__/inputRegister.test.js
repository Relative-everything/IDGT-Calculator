// Inputs audit register (docs/changes/2026-09-28-inputs-audit/plan.md): it lists every UI field exactly once, shows
// exactly the values the engine uses, and its flags, totals, ticks and exports behave as documented.
import { describe, it, expect } from 'vitest';
import {
  buildInputRegister, HOUSEHOLD_FIELDS, ASSET_FIELDS, ASSET_COLUMNS, assetFingerprint, assetTickKey, assetTableRows, assetTableTsv, registerToCsv,
  liveTicks, matchesFilter,
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
  });
});

describe('validation errors land on every field that feeds them', () => {
  const refsOf = (reg, code = 'INVALID') => reg.flags.filter((f) => f.code === code).map((f) => f.ref).sort();
  it.each([
    ['an estate tax rate of 0', (st) => { st.estate.estateTaxRate = '0'; }, ['E.estateTaxRate']],
    ['a grantor ordinary stack of 100% or more: each part of it', (st) => { st.grantor.fedOrd = '99'; }, ['G.fedOrd', 'G.niit', 'G.stateOrd']],
    ["an heirs' rate stack of 100% or more, NIIT on", (st) => { st.estate.beneFedLtcg = '99'; }, ['E.beneFedLtcg', 'E.beneNiit', 'E.beneStateLtcg', 'G.niit']],
    ["an heirs' rate stack of 100% or more, NIIT off", (st) => { st.estate.beneFedLtcg = '99'; st.estate.beneNiit = false; st.estate.beneStateLtcg = '5'; }, ['E.beneFedLtcg', 'E.beneStateLtcg']],
    ['a negative basis', (st) => { st.assets[0].basis = '-1'; }, ['A1.basis']],
    ['a negative sale year', (st) => { st.assets[0].saleYear = '-2'; }, ['A1.saleYear']],
    ['a prior-gift year with no exclusion on file', (st) => { st.estate.priorGifts = '1000000'; st.estate.priorGiftYear = '1990'; }, ['E.priorGiftYear']],
    ['a negative custom prior-gift exclusion', (st) => { st.estate.priorGifts = '1000000'; st.estate.priorExclusionMode = 'custom'; st.estate.priorGiftExclusion = '-5'; }, ['E.priorGiftExclusion']],
  ])('%s', (_, patch, refs) => {
    const st = single();
    st.assets = [st.assets[0]];
    patch(st);
    expect(refsOf(buildInputRegister(withModel(st)))).toEqual(refs);
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
    expect(reg.progress).toEqual({ verified: 0, total: inUse + 3, hidden: 0 });
  });
  it('two identical rows need a tick each: ticking one does not verify its double', () => {
    const st = single();
    st.assets.push({ ...st.assets[0], id: 'double' });
    const first = assetTickKey(st.assets[0]);
    const reg = buildInputRegister({ ...st, audit: { ticks: { [first]: { at: '2026-09-28' } } } });
    expect(reg.assets.map((r) => r.verified)).toEqual([true, false, false, false]);
    expect(reg.progress.verified).toBe(1);
    expect(reg.assets[3].tickKey).toBe(`${first}#2`);
    const both = buildInputRegister({ ...st, audit: { ticks: { [first]: { at: '2026-09-28' }, [`${first}#2`]: { at: '2026-09-28' } } } });
    expect(both.assets.map((r) => r.verified)).toEqual([true, false, false, true]);
  });
  it('a tick on a changed row is hidden and counted, and only live ticks are exported', () => {
    const st = single();
    const ticks = {
      'E.otherEstate': { v: '20000000', at: '2026-09-28' },
      'G.fedOrd': { v: '35', at: '2026-09-28' }, // value changed since (37 now)
      'G.spouseAge': { v: '62', at: '2026-09-28' }, // not in use for a single grantor
      [assetTickKey(st.assets[1])]: { at: '2026-09-28' },
      'A:0badf00d': { at: '2026-09-28' }, // a row that no longer exists
    };
    const reg = buildInputRegister({ ...st, audit: { ticks } });
    expect(reg.progress.verified).toBe(2);
    expect(reg.progress.hidden).toBe(3);
    expect(Object.keys(liveTicks(st, ticks)).sort()).toEqual(['E.otherEstate', assetTickKey(st.assets[1])].sort());
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
    const csv = registerToCsv(reg, 'typed').split('\n')[2];
    expect(csv).toContain('"x;=1+1;"'); // quoted, so a ';'-separator Excel cannot split it into a formula cell
    expect(csv).toContain(",'0042,");
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
