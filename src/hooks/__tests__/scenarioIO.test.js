// Import/export hardening: untrusted JSON is coerced, ids regenerated, CSV formula cells neutralised.
import { describe, it, expect } from 'vitest';
import { parseScenario, csvCell, rankingToCsv, MAX_IMPORT_ASSETS, SCENARIO_VERSION } from '../scenarioIO.js';

const defaults = {
  grantor: { age: '65', sex: 'male', useDeathYear: false, deathYear: '20', fedOrd: '37', stateOrd: '5', niit: '3.8', fedLtcg: '20', stateLtcg: '5' },
  estate: { otherEstate: '20000000', priorExclusionMode: 'year', beneNiit: true },
  settings: { rankKey: 'opt', discountAtDeath: false, saleAppliesToBaseline: true, swapCustom: false },
  asset: { name: 'Asset 1', fmv: '1000000', basis: '200000' },
};

describe('parseScenario', () => {
  it('coerces field types: object names fall back, string booleans are ignored, numbers become strings', () => {
    const s = parseScenario(JSON.stringify({ version: SCENARIO_VERSION, grantor: { useDeathYear: 'false', age: 70, sex: 'other' }, assets: [{ name: { x: 1 }, fmv: 2_500_000 }] }), defaults);
    expect(s.grantor.useDeathYear).toBe(false);
    expect(s.grantor.age).toBe('70');
    expect(s.grantor.sex).toBe('male');
    expect(s.assets[0].name).toBe('Asset 1');
    expect(s.assets[0].fmv).toBe('2500000');
    expect(s.assets[0].basis).toBe('200000');
  });
  it('drops non-object asset entries, regenerates ids, caps the list, and reports what was dropped', () => {
    const many = Array.from({ length: MAX_IMPORT_ASSETS + 3 }, (_, i) => ({ id: 'same', name: `A${i}` }));
    const s = parseScenario(JSON.stringify({ assets: [null, 5, ...many] }), defaults);
    expect(s.assets.length).toBe(MAX_IMPORT_ASSETS);
    expect(new Set(s.assets.map((a) => a.id)).size).toBe(MAX_IMPORT_ASSETS);
    expect(s.assets.every((a) => a.id !== 'same')).toBe(true);
    expect(s.dropped).toBe(5);
  });
  it('rejects non-JSON, non-objects, unsupported versions and oversized text', () => {
    expect(() => parseScenario('nope', defaults)).toThrow(/valid JSON/);
    expect(() => parseScenario('[1,2,3]', defaults)).toThrow(/scenario object/);
    expect(() => parseScenario(JSON.stringify({ version: 99 }), defaults)).toThrow(/version/);
    expect(() => parseScenario('x'.repeat(3 * 1024 * 1024), defaults)).toThrow(/too large/);
  });
  it('does not pollute Object.prototype', () => {
    parseScenario('{"__proto__":{"polluted":1},"grantor":{"__proto__":{"polluted":1}}}', defaults);
    expect({}.polluted).toBeUndefined();
  });
});

describe('csv', () => {
  it('neutralises formula-leading text and keeps numbers raw', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('+1')).toBe('"\'+1"');
    expect(csvCell('-Family LP')).toBe('"\'-Family LP"');
    expect(csvCell('@SUM(1)')).toBe('"\'@SUM(1)"');
    expect(csvCell('a\rb')).toBe('"a\rb"');
    expect(csvCell(-115086.29)).toBe('-115086.29');
    expect(csvCell('Growth stock')).toBe('Growth stock');
    expect(csvCell('a;=1+1')).toBe('"a;=1+1"'); // a ';' list-separator Excel would otherwise split off a formula
    expect(csvCell('a\tb')).toBe('"a\tb"');
  });
  it('audit tick keys: household refs, asset fingerprints and the #k of an identical row; anything else is dropped', () => {
    const { audit } = parseScenario(JSON.stringify({ audit: { ticks: {
      'G.age': { v: '65' }, 'A:0badf00d': {}, 'A:0badf00d#2': {}, 'A:0badf00d#0': {}, 'A:0badf00d#1000': {}, 'A:0badf00d#x': {}, 'X.age': {},
    } } }), { grantor: {}, estate: {}, settings: {}, asset: {} });
    expect(Object.keys(audit.ticks).sort()).toEqual(['A:0badf00d', 'A:0badf00d#2', 'G.age']);
  });
  it('rankingToCsv emits one line per row with the neutralised name', () => {
    const row = { rank: 1, name: '=1+1', cumulativeTaxableGift: 1, result: { derived: { Ug: 1, Uc: 1, G: 0, expectedDeathYear: 2 }, npvNone: 1, sStar: 0, npvOpt: 1, eff: { opt: 1, none: 1 }, effPerFMV: { opt: 1 }, npvPF: 1, components: { opt: { freeze: 0, burn: 0, giftTax: 0, resid: 0, stepUp: 0 } } } };
    const lines = rankingToCsv([row]).split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1].startsWith('1,"\'=1+1",')).toBe(true);
  });
});

describe('ING comparison fields (ING model.md §13)', () => {
  const withIng = { ...defaults, settings: { ...defaults.settings, burnShare: '100', ingFedOrd: '37', ingFedLtcg: '20', ingStateRate: '0', ingAdminRate: '0', ingStateTaxOnGrantor: false } };
  it('round-trips the five string fields and the flag; a v1 file without them loads with the defaults', () => {
    const s = parseScenario(JSON.stringify({ version: 1, settings: { burnShare: '40', ingStateRate: 3.5, ingAdminRate: '0.6', ingStateTaxOnGrantor: true } }), withIng);
    expect(s.settings.burnShare).toBe('40');
    expect(s.settings.ingStateRate).toBe('3.5');
    expect(s.settings.ingAdminRate).toBe('0.6');
    expect(s.settings.ingStateTaxOnGrantor).toBe(true);
    expect(s.settings.ingFedOrd).toBe('37');
    const v1 = parseScenario(JSON.stringify({ version: 1, settings: { rankKey: 'none' } }), withIng);
    expect(v1.settings.burnShare).toBe('100');
    expect(v1.settings.ingStateTaxOnGrantor).toBe(false);
    expect(parseScenario(JSON.stringify({ settings: { ingStateTaxOnGrantor: 'true' } }), withIng).settings.ingStateTaxOnGrantor).toBe(false);
  });
  it('the ranking CSV carries the ING columns and neutralises nothing numeric', () => {
    const row = {
      rank: 1, name: 'A', cumulativeTaxableGift: 1,
      result: { derived: { Ug: 1, Uc: 1, G: 0, expectedDeathYear: 3 }, npvNone: 1, sStar: 0, npvOpt: 1, eff: { opt: 1, none: 1 }, effPerFMV: { opt: 1 }, npvPF: 1,
        components: { opt: { freeze: 0, burn: 0, giftTax: 0, resid: 0, stepUp: 0 } } },
      ing: { npv: -5.5, vsIdgt: { deltaOpt: -6.5, deltaNone: 2, verdict: 'IDGT' }, components: { ssNet: 1, locNet: -2, feeNet: 0, stepUp: 0 } },
    };
    const [header, line] = rankingToCsv([row]).split('\n');
    expect(header).toContain('NPV ING');
    expect(header.split(',').length).toBe(line.split(',').length);
    expect(line.endsWith('-5.5,-6.5,2,IDGT,1,-2,0,0')).toBe(true);
  });
});
