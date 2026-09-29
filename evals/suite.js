// IDGT calculator eval suite — see evals/README.md for the methodology. CLI: evals/run.mjs; CI: evals/evals.test.js.
//
// Six layers, all graded by code (no human or model judgement in the loop):
//   L1 hand calculations      closed-form answers a reviewer can redo on paper; grade engine AND oracle
//   L2 oracle agreement       engine vs the clean-room statutory oracle on named personas + a stratified sweep
//                             (single grantors: ./oracle/evaluate.js; married couples: the pair ledger ./oracle/couple.js)
//   L3 invariants & theorems  identities and economic theorems that must hold on every scenario
//   L4 metamorphic            scale invariance, toggle identities, married ≡ single identities, discontinuity scans
//   L5 UI wiring              every field and toggle: mapping, sensitivity, full-pipeline agreement, ranking
//   L6 breakevens & data      breakeven roots bracket a real sign change; grid cells; reference tables; life tables and
//                             death-year / joint-life probabilities against the published SSA columns
// runEvals() returns every check with its pass/fail counts and the first failing examples.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as engine from '../src/engine/index.js';
import { buildEngineInputs, validateUiFields } from '../src/hooks/buildInputs.js';
import { BASIC_EXCLUSION_BY_YEAR } from '../src/data/exclusionAmounts.js';
import { SSA_2021_LX } from '../src/data/mortalityTable.js';
import { LIFE_TABLES, LIFE_TABLE_BY_ID, DEFAULT_LIFE_TABLE_ID } from '../src/data/lifeTables/index.js';
import { makeScenarios, rng } from './scenarios/generator.js';
import { PERSONAS, DEFAULTS } from './scenarios/personas.js';
import { HAND_CASES, MORTALITY_HAND_CASES } from './scenarios/handcalc.js';
import { expectedEngineInputs, BEA_BY_YEAR, DEFAULT_TABLE, AUDIT_FIELD_MEANING, AUDIT_FIELD_PARSE, AUDIT_ERROR_PARTS, auditParse } from './oracle/ui.js';
import { oracleEvaluate, oracleIng, oracleRank, deathDistribution } from './oracle/evaluate.js';
import { oracleCouple, coupleLives } from './oracle/couple.js';
import { ssa2023FromCsv, survivorsFromRates, deathYearsFromRates, secondDeathByPairs, lifeExpectancy, SSA_2023_PDF, TERMINAL_AGE } from './oracle/lives.js';
import { engineView, oracleView, coupleView, readPath } from './graders/views.js';
import { runPipeline, PIPELINE_SOURCE } from './graders/pipeline.js';
import { buildInputRegister, assetTableRows, HOUSEHOLD_FIELDS, ASSET_FIELDS, ASSET_COLUMNS } from '../src/hooks/inputRegister.js';

// The deathbed-swap tile's sub-line (src/components/format.js once F3 is fixed; the pre-fix text otherwise).
let deathbedNote = null;
try { ({ deathbedNote } = await import('../src/components/format.js')); } catch { /* pre-fix build */ }

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SEED = 20260927;
// SHA-256 of the SSA page the builder supplied (docs/sources/README.md); the registry records the same digest.
const SSA_2023_PDF_SHA256 = '8f9a6c21b3010408028eeebb02a1f9529e213df7cefac0ce3d21c64723c8f3f5';

/**
 * Run every layer.
 * @param {{ label?:string, n?:number, seed?:number, quick?:boolean, write?:boolean }} [opts]
 *   quick — a reduced sweep and subsets for CI; write — save results/<label>.json
 */
export async function runEvals({ label = 'run', n, seed = DEFAULT_SEED, quick = false, write = true } = {}) {
  const LABEL = label;
  const QUICK = quick;
  const N_SWEEP = n ?? (QUICK ? 200 : 1500);
  const SEED = seed;
  const t0 = Date.now();

  // ---------------------------------------------------------------------------------------------------------
  // Recorder
  const checks = new Map(); // key `${layer}|${name}` → { layer, name, pass, fail, examples[] }
  const blocked = []; // checks that cannot run in this environment — reported, never counted as passes
  function record(layer, name, ok, detail) {
    const key = `${layer}|${name}`;
    if (!checks.has(key)) checks.set(key, { layer, name, pass: 0, fail: 0, examples: [] });
    const c = checks.get(key);
    if (ok) c.pass += 1;
    else {
      c.fail += 1;
      if (c.examples.length < 6) c.examples.push(detail);
    }
    return ok;
  }
  const moneyTol = (scale) => 0.01 + 1e-11 * Math.abs(scale);
  const closeMoney = (a, b, scale = 0) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= moneyTol(Math.max(scale, Math.abs(a), Math.abs(b)));
  const closeRatio = (a, b) => (a == null && b == null) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)));
  // probabilities: absolute 1e-15 plus relative 1e-12 (the joint distribution's far tail is ~1e-12 and must keep its digits)
  const closeProbs = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= 1e-15 + 1e-12 * Math.abs(b[i]));

  // ---------------------------------------------------------------------------------------------------------
  // Oracle dispatch: the single-life worlds or, for a married couple, the pair ledger. On the married sweep the swap curve
  // is SAMPLED — no swap, the engine's s* and its neighbours, years 1, 2 and N_G, three random years — except on personas
  // and every FULL_EVERY-th married scenario, where every year is valued (the full curve is O(N_G² N_S) pair valuations).
  const FULL_EVERY = 8;
  const sampler = rng((SEED ^ 0x5eed) >>> 0);
  function swapSample(want, sStar) {
    const { NG } = coupleLives(want);
    const years = new Set([1, 2, NG, sStar, sStar - 1, sStar + 1]);
    for (let k = 0; k < 3; k += 1) years.add(1 + Math.floor(sampler.next() * NG));
    return [...years].filter((s) => s >= 1 && s <= NG);
  }
  function oracleFor(want, { sStar = null, full = true } = {}) {
    if (want.married) {
      const oc = oracleCouple(want, { swapYears: full || sStar == null ? 'all' : swapSample(want, sStar) });
      return { married: true, oc, view: coupleView(oc, sStar ?? oc.sStar), npvNone: oc.npvNone, npvOpt: oc.npvOpt, sStar: oc.sStar, ingNpv: oc.npvIng, facts: oc.facts, eff: oc.eff, N: oc.N };
    }
    const o = oracleEvaluate(want);
    const oi = oracleIng(want, o);
    return { married: false, o, oi, view: oracleView(o, oi, sStar ?? o.sStar), npvNone: o.npvNone, npvOpt: o.npvOpt, sStar: o.sStar, ingNpv: oi.npv, facts: o.facts, eff: o.eff, N: o.N };
  }
  // ING minus IDGT at the best swap year, full swap search (breakeven checks)
  const oracleDelta = (inp) => { const O = oracleFor(inp); return O.ingNpv - O.npvOpt; };

  // ---------------------------------------------------------------------------------------------------------
  // L1 — hand calculations
  for (const hc of HAND_CASES) {
    let ev;
    try {
      const res = engine.evaluateAsset(hc.inputs);
      ev = engineView(res, engine.evaluateIng(hc.inputs, res));
    } catch (e) { record('L1 hand calc', `${hc.id} engine runs`, false, { id: hc.id, error: e.message }); continue; }
    const ov = oracleFor(hc.inputs).view;
    for (const [path, expected] of Object.entries(hc.expect)) {
      for (const [who, view] of [['engine', ev], ['oracle', ov]]) {
        const got = path === 'expectedDeathYear' ? view.expectedDeathYear : readPath(view, path);
        const ok = typeof expected === 'number' && path !== 'sStar' ? closeMoney(got, expected) : got === expected;
        record('L1 hand calc', `${who}: ${hc.id} ${path}`, ok, { id: hc.id, title: hc.title, path, expected, got, diff: typeof got === 'number' ? got - expected : null });
      }
    }
  }
  // Mortality hand checks against the published columns (engine: registry → survivors → death years; oracle: the CSV).
  const defaultTable = LIFE_TABLE_BY_ID[DEFAULT_LIFE_TABLE_ID];
  for (const hc of MORTALITY_HAND_CASES) {
    if (hc.joint) {
      const engineQ = engine.secondDeathDistribution(engine.deathProbabilities({ lx: hc.joint.lxG, age: 0 }).q, engine.deathProbabilities({ lx: hc.joint.lxS, age: 0 }).q);
      const oracleQ = secondDeathByPairs(deathDistribution({ lx: hc.joint.lxG, age: 0 }).q, deathDistribution({ lx: hc.joint.lxS, age: 0 }).q);
      for (const [who, q] of [['engine', engineQ], ['oracle', oracleQ]]) {
        record('L1 hand calc', `${who}: ${hc.id} second-death distribution`, q.length === hc.expect.length && q.every((x, i) => Math.abs(x - hc.expect[i]) <= hc.tol), { id: hc.id, title: hc.title, got: q, expected: hc.expect });
        const mean = q.reduce((a, p, i) => a + p * (i + 1), 0);
        record('L1 hand calc', `${who}: ${hc.id} expected second-death year`, Math.abs(mean - hc.expectMean) <= 1e-12, { id: hc.id, got: mean, expected: hc.expectMean });
      }
      continue;
    }
    const engineQ = engine.deathProbabilities({ lx: engine.lxFromLifeTable(defaultTable, hc.sex), age: hc.age }).q;
    const oracleQ = deathYearsFromRates(hc.sex, hc.age);
    const value = (q, who) => {
      if (hc.what === 'q1') return q[0];
      if (hc.what === 'survive20') return 1 - q.slice(0, 20).reduce((a, b) => a + b, 0);
      return who === 'engine' ? engine.lifeExpectancyYears(q) : lifeExpectancy(q);
    };
    for (const [who, q] of [['engine', engineQ], ['oracle', oracleQ]]) {
      const got = value(q, who);
      record('L1 hand calc', `${who}: ${hc.id} ${hc.what}`, Math.abs(got - hc.expect) <= hc.tol, { id: hc.id, title: hc.title, got, expected: hc.expect, diff: got - hc.expect });
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // L2 — oracle agreement on personas and the stratified sweep
  function compareViews(id, ev, ov, scale, layer = 'L2 oracle agreement') {
    const d = (name, a, b, extra = {}) => record(layer, name, closeMoney(a, b, scale), { id, engine: a, oracle: b, diff: a - b, ...extra });
    for (const k of ['Ug', 'R', 'Uc', 'G', 'BT0']) d(`derived.${k}`, ev.derived[k], ov.derived[k]);
    record(layer, 'horizon N', ev.N === ov.N, { id, engine: ev.N, oracle: ov.N });
    record(layer, 'death probabilities q', closeProbs(ev.q, ov.q), { id });
    record(layer, 'expected death year', closeRatio(ev.expectedDeathYear, ov.expectedDeathYear), { id, engine: ev.expectedDeathYear, oracle: ov.expectedDeathYear });
    const married = Boolean(ev.married) && Boolean(ov.married);
    if (ev.married || ov.married) {
      record(layer, 'married: engine and oracle both in married mode', married, { id, engine: Boolean(ev.married), oracle: Boolean(ov.married) });
      if (married) {
        const em = ev.married; const om = ov.married;
        record(layer, 'married: horizons N_G and N_S', em.NG === om.NG && em.NS === om.NS, { id, engine: [em.NG, em.NS], oracle: [om.NG, om.NS] });
        record(layer, 'married: grantor death probabilities q^G', closeProbs(em.qG, om.qG), { id });
        record(layer, 'married: spouse death probabilities q^S', closeProbs(em.qS, om.qS), { id });
        record(layer, 'married: expected grantor death year', closeRatio(em.expectedGrantorDeathYear, om.expectedGrantorDeathYear), { id, engine: em.expectedGrantorDeathYear, oracle: om.expectedGrantorDeathYear });
      }
    }
    d('NPV no swap', ev.npvNone, ov.npvNone);
    const swapYears = married ? ev.married.NG : ev.N;
    record(layer, 'swap curve covers s = 0 … N_swap', ev.curve.length === swapYears + 1 && ev.curve.every((c, i) => c.s === i), { id, length: ev.curve.length, expected: swapYears + 1 });
    let curveOk = true; let feasOk = true; let first = null;
    for (const b of ov.curve) {
      const a = ev.curve.find((c) => c.s === b.s);
      if (!a || a.feasible !== b.feasible) { feasOk = false; first ??= { s: b.s, engine: a?.feasible, oracle: b.feasible }; continue; }
      if (b.feasible && !closeMoney(a.npv, b.npv, scale)) { curveOk = false; first ??= { s: b.s, engine: a.npv, oracle: b.npv, diff: a.npv - b.npv }; }
    }
    record(layer, 'swap-year feasibility', feasOk, { id, first });
    record(layer, 'NPV by swap year (whole curve, or the sampled years)', curveOk, { id, first, sampled: Boolean(ov.curveSampled) });
    // s*: must match, or the engine's choice must be a tie with the oracle's optimum under the documented tolerance
    // (with a sampled curve: no sampled year may beat the engine's choice)
    const oAtEngine = ov.curve.find((c) => c.s === ev.sStar);
    const tieTol = 2e-6 * Math.max(1, Math.abs(ov.maxNpv));
    const sOk = ev.sStar === ov.sStar || (oAtEngine?.feasible && ov.maxNpv - oAtEngine.npv <= tieTol);
    record(layer, 'optimal swap year s*', sOk, { id, engine: ev.sStar, oracle: ov.sStar });
    d('NPV at s*', ev.npvOpt, oAtEngine?.npv ?? NaN);
    d('deathbed-swap value', ev.npvPF, ov.npvPF);
    for (const k of ['none', 'opt']) {
      record(layer, `NPV per $ taxable gift (${k})`, closeRatio(ev.eff[k], k === 'opt' && ev.eff.opt != null ? (oAtEngine?.npv ?? NaN) / ov.derived.Ug : ov.eff[k]), { id, engine: ev.eff[k], oracle: ov.eff[k] });
    }
    const rowKeys = ['V', 'Vs', 'Eb', 'Es', 'T', 'TEb', 'TEs', 'ETb', 'ETs', 'SUb', 'SUs', 'Hb', 'Hs', 'dH', ...(married ? ['ET1', 'dsueHold', 'dsueGift', 'grantorFirst'] : [])];
    const closeKey = (k, a, b) => (k === 'grantorFirst' ? closeRatio(a, b) : closeMoney(a, b, scale));
    for (const [lbl, er, orr] of [['ledger (no swap)', ev.rowsNone, ov.rowsNone], ['ledger (s*)', ev.rowsOpt, ov.rowsOpt]]) {
      const bad = {};
      record(layer, `${lbl}: one row per year of the (second) death`, er.length === orr.length, { id, engine: er.length, oracle: orr.length });
      er.forEach((row, i) => {
        if (!orr[i]) return;
        for (const k of rowKeys) if (!closeKey(k, row[k], orr[i][k])) bad[k] ??= { t: row.t, engine: row[k], oracle: orr[i][k], diff: row[k] - orr[i][k] };
      });
      for (const k of rowKeys) record(layer, `${lbl}: ${k}`, !bad[k], { id, ...bad[k] });
    }
    if (ev.ing && ov.ing) {
      d('ING NPV', ev.ing.npv, ov.ing.npv);
      d('ING minus IDGT (best swap)', ev.ing.deltaOpt, ov.ing.deltaOpt);
      d('ING minus IDGT (no swap)', ev.ing.deltaNone, ov.ing.deltaNone);
      const clear = Math.abs(ov.ing.deltaOpt) > 1e-5 * Math.max(1, Math.abs(ov.npvOpt));
      record(layer, 'ING verdict', !clear || ev.ing.verdict === ov.ing.verdict, { id, engine: ev.ing.verdict, oracle: ov.ing.verdict, delta: ov.ing.deltaOpt });
      const bad = {};
      const ingKeys = ['Vn', 'En', 'TEn', 'ETn', 'SUn', 'Hn', 'dH', ...(married ? ['dsue'] : [])];
      ev.ing.rows.forEach((row, i) => {
        for (const k of ingKeys) if (!closeMoney(row[k], ov.ing.rows[i]?.[k], scale)) bad[k] ??= { t: row.t, engine: row[k], oracle: ov.ing.rows[i]?.[k], diff: row[k] - ov.ing.rows[i]?.[k] };
      });
      for (const k of ingKeys) record(layer, `ING ledger: ${k}`, !bad[k], { id, ...bad[k] });
    }
  }

  function warningsCheck(id, inp, res, ing, O) {
    const codes = new Set(res.warnings.map((w) => w.code));
    const L = 'L3 invariants & theorems';
    record(L, 'warning BUILT_IN_LOSS iff basis > FMV', codes.has('BUILT_IN_LOSS') === (inp.B0 > inp.FMV), { id });
    record(L, 'warning ZERO_TAXABLE_GIFT iff taxable gift = 0', codes.has('ZERO_TAXABLE_GIFT') === !(O.facts.Ug > 0), { id });
    record(L, 'warning PRIOR_GIFT_TAX iff prior gifts exceeded their exclusion', codes.has('PRIOR_GIFT_TAX') === (inp.P > 0 && inp.P > inp.XP), { id });
    record(L, 'warning SALE_BEYOND_HORIZON iff S > N', codes.has('SALE_BEYOND_HORIZON') === (inp.S > O.N), { id });
    let illiquid; let liquidates;
    if (O.married) {
      const { oc } = O;
      // liquidity is the grantor's while the grantor pays the burn: the grantor-alive gift path, no swap and at s*
      illiquid = oc.aliveE(0).some((e) => e < 0) || (res.sStar > 0 && oc.feasibleAt(res.sStar) && oc.aliveE(res.sStar).some((e) => e < 0));
      liquidates = oc.ingLiquidates;
      record(L, 'warning PORTABILITY_OFF iff married without the election', codes.has('PORTABILITY_OFF') === (inp.portability === false), { id });
      // the §2035(b) add-back is taxed at a FIRST death: grantor can die in year i ≤ 3 while the spouse is still alive
      const spouseAlive = (i) => oc.lives.qS.slice(i - 1).reduce((a, b) => a + b, 0);
      const firstDeathTax = oc.ET1ByYear.some((x, k) => x > 0 && oc.lives.qG[k] > 0 && spouseAlive(k + 1) > 0);
      record(L, 'warning FIRST_DEATH_TAX iff the add-back is taxed at a possible first death', codes.has('FIRST_DEATH_TAX') === firstDeathTax, { id, warned: codes.has('FIRST_DEATH_TAX'), ET1: oc.ET1ByYear });
      record(L, "warning SPOUSE_PRIOR_GIFT_TAX iff the spouse's prior gifts exceeded their exclusion", codes.has('SPOUSE_PRIOR_GIFT_TAX') === (inp.PS > 0 && inp.PS > inp.XPS), { id });
    } else {
      const { o, oi } = O;
      illiquid = o.sims[0].rows.some((r) => r.E < 0) || (o.sStar > 0 && o.sims[o.sStar].rows.some((r) => r.E < 0));
      liquidates = oi.rows.some((r) => r.liquidated);
      record(L, 'no married-couple warning for a single grantor', !['PORTABILITY_OFF', 'FIRST_DEATH_TAX', 'SPOUSE_PRIOR_GIFT_TAX'].some((k) => codes.has(k)), { id, codes: [...codes] });
    }
    record(L, 'warning GRANTOR_ILLIQUID iff the other estate goes negative', codes.has('GRANTOR_ILLIQUID') === illiquid, { id });
    if (ing) {
      const ingCodes = new Set(ing.warnings.map((w) => w.code));
      record(L, 'warning ING_FEE_EXCEEDS_YIELD iff the ING must liquidate to pay its fee', ingCodes.has('ING_FEE_EXCEEDS_YIELD') === liquidates, { id, warned: ingCodes.has('ING_FEE_EXCEEDS_YIELD'), liquidates });
    }
  }

  function theorems(id, inp, res, ing) {
    const L = 'L3 invariants & theorems';
    record(L, 'NPV(s*) ≥ NPV(no swap)', res.npvOpt >= res.npvNone - 1e-9 * Math.max(1, Math.abs(res.npvNone)), { id, npvOpt: res.npvOpt, npvNone: res.npvNone });
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    record(L, 'IDGT components sum to NPV (none)', closeMoney(sum(res.components.none), res.npvNone), { id });
    record(L, 'IDGT components sum to NPV (s*)', closeMoney(sum(res.components.opt), res.npvOpt), { id });
    record(L, 'rows reproduce the NPV: Σ q_t DF_t ΔH_t = NPV(s*)', closeMoney(res.rows.opt.reduce((a, r) => a + r.q * r.DF * r.dH, 0), res.npvOpt), { id });
    if (ing) {
      record(L, 'ING components sum to ING NPV', closeMoney(sum(ing.components), ing.npv), { id });
      const b = ing.vsIdgt.bridge;
      record(L, 'bridge ends at the ING NPV', closeMoney(b.steps[b.steps.length - 1].to, ing.npv), { id });
    }
    // A swap cannot change outcomes for deaths before it happens (married: second death before s ⇒ grantor died before s).
    if (res.sStar > 1) {
      const ok = res.rows.opt.slice(0, res.sStar - 1).every((r, i) => r.dH === res.rows.none[i].dH);
      record(L, 'ΔH_t(s*) = ΔH_t(none) for t < s*', ok, { id });
    }
    // What the detail tile says about the deathbed-swap value must be true. Pre-fix builds labelled it an "upper bound"
    // whenever every swap year was feasible (claim: npvPF ≥ NPV(s*)); fixed builds state the comparison (format.js).
    const allFeasible = res.npvCurve.slice(1).every((c) => c.feasible);
    const note = deathbedNote ? deathbedNote(res.npvPF >= res.npvOpt, allFeasible) : (allFeasible ? 'upper bound: swap always precedes death' : 'swap in the death year where feasible; not a bound here');
    const claimsBound = /upper bound/i.test(note);
    const claimsAbove = /beats the best fixed year/.test(note);
    const claimsBelow = /below the best fixed year/.test(note);
    const truthful = (!claimsBound || res.npvPF >= res.npvOpt - moneyTol(res.npvOpt))
      && (!claimsAbove || res.npvPF >= res.npvOpt - moneyTol(res.npvOpt))
      && (!claimsBelow || res.npvPF < res.npvOpt);
    record(L, 'deathbed-swap tile text is true (no false "upper bound")', truthful, { id, note, npvPF: res.npvPF, npvOpt: res.npvOpt, gap: res.npvPF - res.npvOpt });
    // Probabilities sum to 1 and ledger values are finite.
    record(L, 'Σ q = 1', Math.abs(res.q.reduce((a, b) => a + b, 0) - 1) <= 1e-12, { id });
    record(L, 'all ledger values finite', res.rows.opt.every((r) => Number.isFinite(r.Hs) && Number.isFinite(r.Hb)), { id });
    if (res.lives?.married) {
      const lv = res.lives;
      const one = (q) => Math.abs(q.reduce((a, b) => a + b, 0) - 1) <= 1e-12;
      record(L, 'married: Σ q^G = Σ q^S = Σ q^L = 1', one(lv.qG) && one(lv.qS) && one(lv.qL), { id });
      const { expectedGrantorDeathYear: eG, expectedSpouseDeathYear: eS, expectedSecondDeathYear: eL } = res.derived;
      record(L, "married: expected second death ≥ each life's expected death", lv.deterministic || eL >= Math.max(eG, eS) - 1e-12, { id, eG, eS, eL });
      const rows = [...res.rows.none, ...res.rows.opt];
      record(L, 'married: DSUE after the gift ≤ DSUE without it (Reg. §20.2010-2(c): the gift used exclusion)', rows.every((r) => r.dsueGift <= r.dsueHold + moneyTol(r.dsueHold)), { id });
      record(L, 'married: 0 ≤ P(grantor died first | second death in t) ≤ 1', rows.every((r) => r.grantorFirst >= -1e-12 && r.grantorFirst <= 1 + 1e-12), { id });
      record(L, 'married: first-death tax ≥ 0, and only when gift tax was paid', rows.every((r) => r.ET1 >= 0 && (res.derived.G > 0 || r.ET1 === 0)), { id });
      record(L, 'married: horizons N = max(N_G, N_S) and the swap search stops at N_G', res.derived.N === Math.max(res.derived.NG, res.derived.NS) && res.npvCurve.length === res.derived.NG + 1, { id });
      if (ing) record(L, 'married: the ING ports the same DSUE as keeping the asset (an incomplete gift uses no exclusion)', ing.rows.every((r, i) => closeMoney(r.dsue, res.rows.none[i].dsueHold)), { id });
    }
  }

  const personaCases = PERSONAS.map((p) => ({ ...p, source: 'persona' }));
  const sweepCases = makeScenarios(N_SWEEP, SEED).map((s) => ({ ...s, source: 'sweep' }));
  const allCases = [...personaCases, ...sweepCases];
  const valid = []; // { c, inp, want, res, ing, sampled, failed }
  const rejected = [];
  const tagStats = {};
  let marriedSeen = 0;
  let caseIndex = 0;

  for (const c of allCases) {
    caseIndex += 1;
    const state = { grantor: c.grantor, estate: c.estate, settings: c.settings, asset: c.asset };
    // L5a — mapping: the app's UI → engine mapping equals the planner-facing meaning of every field
    const got = buildEngineInputs(state);
    const want = expectedEngineInputs(state);
    for (const [k, w] of Object.entries(want)) {
      const g = got[k];
      let ok;
      if (Array.isArray(w)) ok = Array.isArray(g) && g.length === w.length && g.every((x, i) => Math.abs(x - w[i]) <= 1e-12 * Math.max(1, Math.abs(w[i])));
      else if (typeof w === 'number' && Number.isFinite(w)) ok = typeof g === 'number' && Math.abs(g - w) <= 1e-12 * Math.max(1, Math.abs(w));
      else if (typeof w === 'number') ok = typeof g === 'number' && Number.isNaN(g) === Number.isNaN(w);
      else ok = g === w;
      record('L5 UI wiring', `mapping: ${k}`, ok, { id: c.id, engine: Array.isArray(g) ? `[${g.length}]` : g, expected: Array.isArray(w) ? `[${w.length}]` : w });
    }
    // L5b — the inputs audit page (src/hooks/inputRegister.js) shows exactly what the engine uses, and what the planner-facing
    // meaning of each field implies: an audit page that disagreed with the model would certify the wrong numbers.
    const reg = buildInputRegister({ grantor: c.grantor, estate: c.estate, settings: c.settings, assets: [c.asset] });
    const sameValue = (a, b) => (typeof b === 'number' ? (Number.isNaN(b) ? typeof a === 'number' && Number.isNaN(a) : typeof a === 'number' && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b))) : a === b);
    const shown = [
      ...reg.household.map((row) => [row.ref, HOUSEHOLD_FIELDS.find((f) => f.state[0].toUpperCase() === row.ref[0] && f.key === row.key)?.engine, row.model]),
      ...ASSET_FIELDS.map((f) => [`A1.${f.key}`, f.engine, reg.assets[0].cells[f.key].model]),
    ].filter(([, key]) => key);
    const offEngine = shown.find(([, key, model]) => !sameValue(model, got[key]));
    record('L5 UI wiring', 'inputs audit: every model value shown = the engine input', !offEngine, { id: c.id, ref: offEngine?.[0], shown: offEngine?.[2], engine: offEngine ? got[offEngine[1]] : undefined });
    // ...and what each label means, keyed by the oracle's own field table (never by the page's catalog)
    const everyField = [
      ...reg.household.map((row) => [row.ref, row.raw, row.model]),
      ...ASSET_FIELDS.map((f) => [`A.${f.key}`, reg.assets[0].cells[f.key].raw, reg.assets[0].cells[f.key].model]),
    ];
    const unlisted = everyField.find(([ref]) => !(ref in AUDIT_FIELD_MEANING) && !(ref in AUDIT_FIELD_PARSE));
    record('L5 UI wiring', 'inputs audit: every field on the page has an independent expected meaning', !unlisted, { id: c.id, ref: unlisted?.[0] });
    const expectedShown = (ref, raw) => (ref in AUDIT_FIELD_MEANING ? want[AUDIT_FIELD_MEANING[ref]] : auditParse(AUDIT_FIELD_PARSE[ref], raw));
    const offMeaning = everyField.find(([ref, raw, model]) => !unlisted && !sameValue(model, expectedShown(ref, raw)));
    record('L5 UI wiring', 'inputs audit: every model value shown = the planner-facing meaning of its label', !offMeaning,
      { id: c.id, ref: offMeaning?.[0], shown: offMeaning?.[2], expected: offMeaning ? expectedShown(offMeaning[0], offMeaning[1]) : undefined });
    // ...and the derived model inputs (rate stacks, resolved prior-gift exclusions) = the oracle's, shown exactly when they apply
    const derivedWant = { 'D.tauOrd': want.tauOrd, 'D.tauCg': want.tauCg, 'D.tauBene': want.tauBene,
      ...(want.P > 0 ? { 'D.XP': want.XP ?? NaN } : {}), ...(want.married && want.PS > 0 ? { 'D.XPS': want.XPS ?? NaN } : {}) };
    const derivedShown = Object.fromEntries(reg.derived.map((d) => [d.ref, d.model]));
    const derivedOk = Object.keys(derivedShown).sort().join() === Object.keys(derivedWant).sort().join()
      && Object.entries(derivedWant).every(([ref, w]) => sameValue(derivedShown[ref], w));
    record('L5 UI wiring', "inputs audit: derived model inputs shown = the oracle's, exactly when they apply", derivedOk, { id: c.id, shown: derivedShown, expected: derivedWant });
    if (caseIndex % 5 === 0) {
      // what "in use" means: changing a field the page marks unused leaves every engine input as it was; changing a number
      // the page marks in use changes one. The statuses are the page's claim; the builder is checked against the oracle above.
      const SECTION = { G: 'grantor', E: 'estate', S: 'settings' };
      const ENUM_VALUES = { sex: ['male', 'female'], spouseSex: ['male', 'female'], lifeTable: LIFE_TABLES.map((t) => t.id),
        priorExclusionMode: ['year', 'custom'], spousePriorExclusionMode: ['year', 'custom'], rankKey: ['opt', 'none'] };
      const NUMERIC = new Set(['money', 'pct', 'int', 'number']);
      const perturb = (row) => {
        if (row.kind === 'bool') return !row.raw;
        if (row.kind === 'enum') return ENUM_VALUES[row.key]?.find((v) => v !== row.raw);
        const v = Number(String(row.raw ?? '').replace(/,/g, ''));
        if (Number.isFinite(v)) return String(v + 1);
        return row.status.code === 'unused' ? '7' : undefined; // an unreadable value in use already fails validation
      };
      const sameInputs = (a, b) => Object.keys(a).every((k) => (Array.isArray(a[k])
        ? Array.isArray(b[k]) && a[k].length === b[k].length && a[k].every((x, i) => Object.is(x, b[k][i]))
        : Object.is(a[k], b[k])));
      const wrongStatus = reg.household.find((row) => {
        const code = row.status.code;
        const inUse = code === 'used' || code === 'scope';
        if (code !== 'unused' && !(inUse && NUMERIC.has(row.kind))) return false; // 'label' rows move the display only
        const next = perturb(row);
        if (next === undefined) return false;
        const sec = SECTION[row.ref[0]];
        const moved = !sameInputs(got, buildEngineInputs({ ...state, [sec]: { ...state[sec], [row.key]: next } }));
        return code === 'unused' ? moved : !moved;
      });
      record('L5 UI wiring', 'inputs audit: a field marked "not used" moves no engine input, a number marked in use moves one', !wrongStatus,
        { id: c.id, ref: wrongStatus?.ref, status: wrongStatus?.status.code });
      // an error on a combined model input shows on every typed field that feeds it (the oracle's list of parts)
      const misrouted = [];
      for (const [sec, key, engineKey] of [['grantor', 'fedOrd', 'tauOrd'], ['grantor', 'fedLtcg', 'tauCg'], ['estate', 'beneFedLtcg', 'tauBene']]) {
        const st = { grantor: c.grantor, estate: c.estate, settings: c.settings, [sec]: { ...c[sec], [key]: '99' } };
        const ui = validateUiFields({ ...st, asset: c.asset });
        const errs = ui.length ? ui : engine.validateInputs(buildEngineInputs({ ...st, asset: c.asset })).errors;
        if (!errs.some((e) => e.field === engineKey)) continue;
        const r = buildInputRegister({ ...st, assets: [{ ...c.asset, id: 'a1' }], perAsset: [{ id: 'a1', name: 'a1', errors: errs, warnings: [] }] });
        const flagged = new Set(r.flags.filter((f) => f.code === 'INVALID').map((f) => f.ref));
        const missing = AUDIT_ERROR_PARTS[engineKey](st).filter((ref) => !flagged.has(ref));
        if (missing.length) misrouted.push(`${engineKey}: ${missing.join(' ')}`);
      }
      record('L5 UI wiring', 'inputs audit: an error on a combined rate shows on every field that feeds it', misrouted.length === 0, { id: c.id, misrouted });
      // a tick certifies the checked values: it holds on them and clears when any value in the row changes
      const ticks = { [reg.assets[0].tickKey]: { at: '2026-09-28' } };
      const kept = buildInputRegister({ grantor: c.grantor, estate: c.estate, settings: c.settings, assets: [c.asset], audit: { ticks } }).assets[0].verified;
      const survived = ASSET_FIELDS.filter((f) => buildInputRegister({ grantor: c.grantor, estate: c.estate, settings: c.settings,
        assets: [{ ...c.asset, [f.key]: `${c.asset[f.key] ?? ''}1` }], audit: { ticks } }).assets[0].verified).map((f) => f.key);
      record('L5 UI wiring', 'inputs audit: a tick holds on the checked values and clears when any value in its row changes', kept && survived.length === 0, { id: c.id, kept, survived });
      // a double entry needs its own tick: ticking the first of two identical rows leaves the second unverified
      const twins = buildInputRegister({ grantor: c.grantor, estate: c.estate, settings: c.settings, assets: [c.asset, { ...c.asset, id: 'twin' }], audit: { ticks } });
      record('L5 UI wiring', 'inputs audit: two identical asset rows need a tick each', twins.assets[0].verified && !twins.assets[1].verified,
        { id: c.id, verified: twins.assets.map((r) => r.verified) });
      // the totals row foots the cells shown: every money total = the sum of that column's cells, in whole cents
      const three = buildInputRegister({ grantor: c.grantor, estate: c.estate, settings: c.settings, assets: [c.asset, { ...c.asset, id: 'b' }, { ...c.asset, id: 'c' }] });
      const table = assetTableRows(three, 'model');
      const notFooting = ['fmv', 'basis', 'annualExclusions', 'unrealizedGain', 'giftValue', 'taxableGift'].filter((key) => {
        const i = ASSET_COLUMNS.findIndex((col) => col.key === key);
        const cells = table.rows.map((r) => r[i]);
        if (cells.some((x) => x === '')) return false;
        const cents = cells.reduce((a, x) => a + Math.round(Number(x) * 100), 0);
        return Number(table.totals[i]) !== cents / 100;
      });
      record('L5 UI wiring', 'inputs audit: every money total foots the cells shown (SUM of the pasted column = the totals row)', notFooting.length === 0, { id: c.id, notFooting });
      // an unreadable cell is left out of a control total and counted, never read as 0
      const two = buildInputRegister({ grantor: c.grantor, estate: c.estate, settings: c.settings, assets: [c.asset, { ...c.asset, basis: 'n/a', fmv: 'tbd' }] });
      const toCents = (v) => Math.round(v * 100) / 100; // totals foot the cent-rounded lines
      const okTotals = two.totals.count === 2 && two.totals.B0.skipped === 1 && sameValue(two.totals.B0.sum, toCents(got.B0))
        && two.totals.FMV.skipped === 1 && sameValue(two.totals.FMV.sum, toCents(got.FMV));
      record('L5 UI wiring', 'inputs audit: an unreadable value is left out of a control total and counted', okTotals, { id: c.id, totals: { B0: two.totals.B0, FMV: two.totals.FMV } });
    }
    const uiErrors = validateUiFields(state);
    const { errors } = engine.validateInputs(got);
    if (uiErrors.length || errors.length) { rejected.push({ id: c.id, tags: c.tags, errors: [...uiErrors, ...errors].map((e) => `${e.field}: ${e.message}`) }); continue; }
    let res; let ing;
    try { res = engine.evaluateAsset(got); ing = engine.evaluateIng(got, res); } catch (e) { record('L2 oracle agreement', 'engine evaluates valid input', false, { id: c.id, error: e.message }); continue; }
    const full = c.source === 'persona' || !want.married || marriedSeen % FULL_EVERY === 0;
    if (want.married) marriedSeen += 1;
    record('L5 UI wiring', "inputs audit: taxable gift shown = the engine's U_g", reg.assets[0].derived.taxableGift === res.derived.Ug, { id: c.id, shown: reg.assets[0].derived.taxableGift, engine: res.derived.Ug });
    const O = oracleFor(want, { sStar: res.sStar, full });
    const scale = Math.abs(got.E0) + Math.abs(got.FMV) + Math.max(...res.rows.none.map((r) => Math.abs(r.Hb)));
    const before = [...checks.values()].reduce((a, x) => a + x.fail, 0);
    compareViews(c.id, engineView(res, ing), O.view, scale);
    warningsCheck(c.id, got, res, ing, O);
    theorems(c.id, got, res, ing);
    const failed = [...checks.values()].reduce((a, x) => a + x.fail, 0) > before;
    for (const tag of c.tags) { tagStats[tag] ??= { n: 0, failed: 0 }; tagStats[tag].n += 1; if (failed) tagStats[tag].failed += 1; }
    valid.push({ c, inp: got, want, res, ing, sampled: Boolean(O.view.curveSampled), failed }); // oracle tables dropped: memory
  }

  // ---------------------------------------------------------------------------------------------------------
  // L4 — metamorphic
  const MONEY_FIELDS = ['FMV', 'B0', 'E0', 'X0', 'P', 'XP', 'annualExclusions', 'PS', 'XPS'];
  const subset = valid.filter((_, i) => i % Math.max(1, Math.floor(valid.length / (QUICK ? 30 : 120))) === 0);
  const LM = 'L4 metamorphic';
  const evalBoth = (x) => { const r = engine.evaluateAsset(x); return { r, i: engine.evaluateIng(x, r) }; };
  const sameResult = (a, b) => closeMoney(a.r.npvNone, b.r.npvNone) && closeMoney(a.r.npvOpt, b.r.npvOpt) && a.r.sStar === b.r.sStar && closeMoney(a.i.npv, b.i.npv);
  for (const { c, inp, res, ing } of subset) {
    // Homogeneity: every dollar input ×3 → every dollar output ×3, same swap year.
    const lam = 3;
    const scaled = { ...inp };
    for (const k of MONEY_FIELDS) if (typeof inp[k] === 'number') scaled[k] = inp[k] * lam;
    const r2 = engine.evaluateAsset(scaled);
    const i2 = engine.evaluateIng(scaled, r2);
    record(LM, 'scale invariance: NPV(none) ×3', closeMoney(r2.npvNone, lam * res.npvNone, lam * inp.E0), { id: c.id, got: r2.npvNone, want: lam * res.npvNone });
    record(LM, 'scale invariance: NPV(s*) ×3', closeMoney(r2.npvOpt, lam * res.npvOpt, lam * inp.E0), { id: c.id });
    record(LM, 'scale invariance: ING NPV ×3', closeMoney(i2.npv, lam * ing.npv, lam * inp.E0), { id: c.id, got: i2.npv, want: lam * ing.npv });

    // Toggle identities: inputs that must not matter in this configuration.
    const same = (name, alt, cmpIng = true) => {
      const ra = engine.evaluateAsset(alt);
      const ia = engine.evaluateIng(alt, ra);
      const ok = closeMoney(ra.npvNone, res.npvNone) && closeMoney(ra.npvOpt, res.npvOpt) && ra.sStar === res.sStar && (!cmpIng || closeMoney(ia.npv, ing.npv));
      record(LM, name, ok, { id: c.id, npvNone: [res.npvNone, ra.npvNone], npvOpt: [res.npvOpt, ra.npvOpt], ing: [ing.npv, ia.npv] });
    };
    if (inp.delta === 0) same('discount 0% ⇒ "discount at death" toggle has no effect', { ...inp, discountAtDeath: !inp.discountAtDeath });
    if (inp.S === 0) same('no sale ⇒ "sale also if kept" toggle and post-sale rates have no effect', { ...inp, saleAppliesToBaseline: !inp.saleAppliesToBaseline, gr: inp.gr + 0.013, yr: inp.yr + 0.007 });
    if (inp.P === 0) same('no prior gifts ⇒ prior-gift exclusion has no effect', { ...inp, XP: inp.XP + 1_234_567 });
    if (inp.bSw == null) same('custom swap entered at the neutral values ≡ default consideration', { ...inp, bSw: 1, gSw: inp.rE >= 0 ? 0 : inp.rE, ySw: inp.rE >= 0 ? inp.rE / (1 - inp.tauOrd) : 0, tauSw: inp.tauOrd });
    same('ING design fields never change the IDGT result', { ...inp, ingFedOrd: 0.35, ingFedLtcg: 0.15, ingStateRate: 0.07, ingAdminRate: 0.004, ingStateTaxOnGrantor: !inp.ingStateTaxOnGrantor }, false);
    same('display horizon never changes NPVs', { ...inp, NDisp: inp.NDisp === 10 ? 60 : 10 });
    if (inp.stateOrd === 0 && inp.stateCg === 0) same('NY/CA flag with a 0% home-state rate has no effect', { ...inp, ingStateTaxOnGrantor: !inp.ingStateTaxOnGrantor });
    if (!inp.married) {
      same("spouse fields never change a single grantor's result", { ...inp, ageSpouse: 50, lxSpouse: inp.lx, deathYearOverrideSpouse: inp.deathYearOverride != null ? 3 : null, portability: false, PS: 5_000_000, XPS: 12_000_000 });
    } else {
      if (inp.PS === 0) same("married, no spouse gifts ⇒ the spouse's prior-gift exclusion has no effect", { ...inp, XPS: inp.XPS + 1_234_567 });
      if (inp.deathYearOverride != null && inp.deathYearOverride >= 2) {
        // Spouse certain to die first without the election: the grantor's death is the v1 single-life ledger.
        const a = evalBoth({ ...inp, deathYearOverrideSpouse: 1, portability: false });
        const b = evalBoth({ ...inp, married: false });
        record(LM, 'married: spouse certain to die first, portability off ≡ single grantor', sameResult(a, b), { id: c.id, married: [a.r.npvNone, a.r.npvOpt, a.i.npv], single: [b.r.npvNone, b.r.npvOpt, b.i.npv] });
        // With the election, the spouse's DSUE (X₁ − the spouse's sheltered gifts) simply adds to the grantor's exclusion:
        // ≡ a single grantor whose exclusion is X₀ + DSUE, when nothing is indexed (π = 0) and the gift and prior gifts
        // fit inside X₀ (no gift tax, no anti-clawback), so the larger X₀ changes nothing at the gift date.
        const usedPrior = Math.min(inp.P, inp.XP);
        const D = Math.max(0, inp.X0 - Math.min(inp.PS, inp.XPS));
        if (res.derived.G === 0 && res.derived.Uc === res.derived.Ug && usedPrior + res.derived.Ug <= inp.X0) {
          const a2 = evalBoth({ ...inp, pi: 0, deathYearOverrideSpouse: 1, portability: true });
          const b2 = evalBoth({ ...inp, pi: 0, married: false, X0: inp.X0 + D });
          record(LM, "married: spouse first with portability ≡ single with the exclusion raised by the spouse's DSUE", sameResult(a2, b2), { id: c.id, D, married: [a2.r.npvNone, a2.r.npvOpt, a2.i.npv], single: [b2.r.npvNone, b2.r.npvOpt, b2.i.npv] });
        }
      }
    }
  }

  // Discontinuity scans: NPV(no swap) and the ING NPV are continuous in every continuous input (all kinks are
  // max(0, ·)); a jump that survives refinement to a 1e-12-wide interval is a defect.
  const SCAN = [
    ['ingAdminRate', () => [0, 0.03], 'ing'],
    ['y', () => [0, 0.08], 'both'],
    ['g', () => [-0.02, 0.2], 'both'],
    ['burnShare', () => [0, 1], 'idgt'],
    ['delta', () => [0, 0.5], 'both'],
    ['E0', (inp) => [0, 3 * inp.E0 + 30e6], 'both'],
    ['B0', (inp) => [0, 2 * inp.FMV], 'both'],
    ['annualExclusions', (inp) => [0, inp.FMV], 'idgt'],
    ['rE', () => [-0.02, 0.08], 'both'],
    ['ingStateRate', () => [0, 0.15], 'ing'],
    ['pi', () => [0, 0.05], 'both'],
    ['tauBene', () => [0, 0.4], 'both'],
    ['X0', () => [1e6, 3e7], 'both'],
    ['P', () => [0, 3e7], 'both'],
  ];
  // married couples: the full pair ledger (small horizons keep the full evaluation fast), plus the spouse's gifts
  // the smallest X0 that keeps the indexed exclusion ≥ $1M through the joint horizon (validate.js rejects less)
  const minX0 = (inp, N) => (inp.pi < 0 ? 1.0001e6 / (1 + inp.pi) ** (N - 1) : 1e6);
  const SCAN_MARRIED = [
    ['E0', (inp) => [0, 3 * inp.E0 + 30e6], 'both'],
    ['X0', (inp, N) => [minX0(inp, N), 3e7], 'both'],
    ['P', () => [0, 3e7], 'both'],
    ['PS', () => [0, 3e7], 'both'],
    ['XPS', () => [1e6, 2e7], 'both'],
    ['pi', () => [0, 0.05], 'both'],
    ['rE', () => [-0.02, 0.08], 'both'],
    ['y', () => [0, 0.08], 'both'],
    ['delta', () => [0, 0.5], 'both'],
    ['B0', (inp) => [0, 2 * inp.FMV], 'idgt'],
    ['burnShare', () => [0, 1], 'idgt'],
    ['ingAdminRate', () => [0, 0.03], 'ing'],
  ];
  const scanned = valid.filter((v) => !v.inp.married && subset.includes(v)).slice(0, QUICK ? 10 : 40);
  const scannedMarried = valid.filter((v) => v.inp.married && v.res.derived.NG * v.res.derived.NS <= 1200).slice(0, QUICK ? 1 : 4);
  const jumps = [];
  function scan(c, fns, fields, n) {
    for (const [field, range, which] of fields) {
      const [lo, hi] = range(c.inp, c.res.derived.N);
      for (const kind of which === 'both' ? ['idgt', 'ing'] : [which]) {
        const f = (x) => fns[kind]({ ...c.inp, [field]: x });
        const xs = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
        let ys;
        try { ys = xs.map(f); } catch (e) {
          record(LM, `continuity scan of ${field} stays within valid inputs`, false, { id: c.c.id, field, lo, hi, error: e.message });
          continue;
        }
        const dys = ys.slice(1).map((y, i) => Math.abs(y - ys[i]));
        const med = [...dys].sort((a, b) => a - b)[Math.floor(dys.length / 2)];
        let found = null;
        for (let i = 0; i < n; i += 1) {
          if (!(dys[i] > 8 * med + 1)) continue;
          let a = xs[i]; let b = xs[i + 1];
          for (let it = 0; it < 60 && b - a > 1e-12 * Math.max(1, Math.abs(a)); it += 1) {
            const m = (a + b) / 2;
            if (Math.abs(f(m) - f(a)) >= Math.abs(f(b) - f(m))) b = m; else a = m;
          }
          const jump = f(b) - f(a);
          if (Math.abs(jump) > 1) { found = { at: a, jump }; break; }
        }
        const who = kind === 'ing' ? 'ING NPV' : 'IDGT NPV(none)';
        record(LM, `continuity of ${c.inp.married ? 'married ' : ''}${who} in ${field}`, !found, { id: c.c.id, field, ...found });
        if (found) jumps.push({ id: c.c.id, married: Boolean(c.inp.married), kind, field, ...found });
      }
    }
  }
  for (const v of scanned) {
    const { q } = v.res; const N = v.res.derived.N;
    scan(v, {
      idgt: (x) => engine.aggregate(engine.simulate(x, 0, N).rows, q).npv,
      ing: (x) => engine.simulateIng(x, N).rows.reduce((a, r, i) => a + q[i] * r.PV, 0),
    }, SCAN, 120);
  }
  for (const v of scannedMarried) {
    scan(v, {
      idgt: (x) => engine.evaluateAsset(x).npvNone,
      ing: (x) => engine.evaluateIngMarried(x).rows.reduce((a, r) => a + r.wPV, 0),
    }, SCAN_MARRIED, 48);
  }

  // ---------------------------------------------------------------------------------------------------------
  // L5 — UI wiring: every control moves the right thing, and the full pipeline agrees with the oracle.
  const LU = 'L5 UI wiring';
  const base = { grantor: DEFAULTS.grantor, estate: DEFAULTS.estate, settings: DEFAULTS.settings, asset: { ...DEFAULTS.asset, id: 'x', saleYear: '0' } };
  const withSale = { ...base, asset: { ...base.asset, saleYear: '4', postSaleGrowth: '5', postSaleYield: '2' } };
  const withDiscount = { ...base, asset: { ...base.asset, discount: '30' } };
  const withCustom = { ...base, settings: { ...base.settings, swapCustom: true, swapBasisPct: '60', swapGrowth: '5', swapYield: '1', swapTaxRate: '40' } };
  const set = (st, section, patch) => ({ ...st, [section]: { ...st[section], ...patch } });
  const straddle = { ...base, estate: { ...base.estate, otherEstate: '12000000' } };
  const straddlePrior = set(base, 'estate', { otherEstate: '2500000', priorGifts: '12000000', priorGiftYear: '2024' }); // above the 2019 BEA, below 2024's; base straddles 0
  const withSaleOnlyTrust = set(withSale, 'settings', { saleAppliesToBaseline: false });
  // The "Customise the consideration" switch as the UI performs it (src/hooks/settingsActions.js once it exists).
  let toggleSwapCustom = (settings, on) => ({ ...settings, swapCustom: on });
  try { ({ toggleSwapCustom } = await import('../src/hooks/settingsActions.js')); } catch { /* pre-fix UI: the switch only flips the flag */ }
  const hiState = set(set(base, 'grantor', { stateOrd: '9.3', stateLtcg: '9.3' }), 'estate', { otherEstateGrowth: '4' });
  const hiStateCustomOn = { ...hiState, settings: toggleSwapCustom(hiState.settings, true, buildEngineInputs({ ...hiState, asset: hiState.asset })) };
  const shrinking = set(base, 'estate', { otherEstateGrowth: '-1' });
  const shrinkingCustomOn = { ...shrinking, settings: toggleSwapCustom(shrinking.settings, true, buildEngineInputs({ ...shrinking, asset: shrinking.asset })) };
  // "Set to exclusion fully used in {year}" (EstatePanel): prior gifts = that year's exclusion, measured in that year
  const exhausted2023 = set(straddle, 'estate', { priorGifts: String(BASIC_EXCLUSION_BY_YEAR[2023]), priorGiftYear: '2023', priorExclusionMode: 'year' });
  // Married couples. mbase: the app defaults with "Married" on (65M / 63F, $20M, portability elected) — with portability
  // the couple's $30M of exclusions mostly shelter the survivor's estate, without it they do not.
  const mbase = set(base, 'grantor', { married: true });
  const mdet = set(mbase, 'grantor', { useDeathYear: true }); // assumed deaths: grantor year 20, spouse year 25
  // mSpouseFirst: spouse dies year 1 having made $12M of gifts in 2024 (all sheltered → DSUE $3M), grantor dies year 2;
  // the grantor's estate ($16.44M × 1.03² + asset ≈ $18.61M) sits $0.31M above X₂ + DSUE = $18.3M. A $0.6M change in the
  // spouse's sheltered gifts therefore flips the estate between taxable and not.
  const mSpouseFirst = set(set(mbase, 'grantor', { useDeathYear: true, deathYear: '2', spouseDeathYear: '1' }), 'estate', { otherEstate: '16440000', spousePriorGifts: '12000000', spousePriorGiftYear: '2024' });
  // [control, from-state, to-state, expectation per output: 'moves' | 'same']
  const CONTROLS = [
    ['grantor.age', base, set(base, 'grantor', { age: '72' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.sex', base, set(base, 'grantor', { sex: 'female' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.useDeathYear', base, set(base, 'grantor', { useDeathYear: true }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.deathYear', set(base, 'grantor', { useDeathYear: true }), set(base, 'grantor', { useDeathYear: true, deathYear: '9' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.deathYear (table mode: ignored)', base, set(base, 'grantor', { deathYear: '9' }), { idgt: 'same', ing: 'same' }],
    ['grantor.sex (death-year mode: ignored)', set(base, 'grantor', { useDeathYear: true }), set(base, 'grantor', { useDeathYear: true, sex: 'female' }), { idgt: 'same', ing: 'same' }],
    ['grantor.lifeTable (legacy 2021 table)', base, set(base, 'grantor', { lifeTable: 'ssa-2021-legacy' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.lifeTable (death-year mode: ignored)', set(base, 'grantor', { useDeathYear: true }), set(base, 'grantor', { useDeathYear: true, lifeTable: 'ssa-2021-legacy' }), { idgt: 'same', ing: 'same' }],
    ['grantor.fedOrd', base, set(base, 'grantor', { fedOrd: '35' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.stateOrd', base, set(base, 'grantor', { stateOrd: '9.3' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.niit', base, set(base, 'grantor', { niit: '0' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.fedLtcg (trust sale, family would not sell)', withSaleOnlyTrust, set(withSaleOnlyTrust, 'grantor', { fedLtcg: '15' }), { idgt: 'moves', ing: 'same' }],
    ['grantor.stateLtcg (trust sale, family would not sell)', withSaleOnlyTrust, set(withSaleOnlyTrust, 'grantor', { stateLtcg: '2' }), { idgt: 'moves', ing: 'same' }],
    ['grantor.fedLtcg (sale in both worlds, same basis: gain tax cancels)', withSale, set(withSale, 'grantor', { fedLtcg: '15' }), { idgt: 'same', ing: 'moves' }],
    // married couple and spouse fields
    ['grantor.married', base, mbase, { idgt: 'moves', ing: 'moves' }],
    ['grantor.spouseAge (married)', mbase, set(mbase, 'grantor', { spouseAge: '75' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.spouseSex (married)', mbase, set(mbase, 'grantor', { spouseSex: 'male' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.portability (married, $20M: sheltered with it, taxed without)', mbase, set(mbase, 'grantor', { portability: false }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.portability (spouse first, taxable either way: flat rate, NPV unchanged)', mSpouseFirst, set(mSpouseFirst, 'grantor', { portability: false }), { idgt: 'same', ing: 'same' }],
    ['grantor.age (married)', mbase, set(mbase, 'grantor', { age: '72' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.sex (married)', mbase, set(mbase, 'grantor', { sex: 'female' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.lifeTable (married, legacy 2021 table)', mbase, set(mbase, 'grantor', { lifeTable: 'ssa-2021-legacy' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.lifeTable (married, death-year mode: ignored)', mdet, set(mdet, 'grantor', { lifeTable: 'ssa-2021-legacy' }), { idgt: 'same', ing: 'same' }],
    ['grantor.useDeathYear (married)', mbase, mdet, { idgt: 'moves', ing: 'moves' }],
    ['grantor.deathYear (married, assumed deaths)', mdet, set(mdet, 'grantor', { deathYear: '5' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.spouseDeathYear (married, assumed deaths: spouse now dies first)', mdet, set(mdet, 'grantor', { spouseDeathYear: '12' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.spouseDeathYear (married, table mode: ignored)', mbase, set(mbase, 'grantor', { spouseDeathYear: '9' }), { idgt: 'same', ing: 'same' }],
    ['grantor.spouseAge (married, death-year mode: ignored)', mdet, set(mdet, 'grantor', { spouseAge: '80' }), { idgt: 'same', ing: 'same' }],
    ['grantor.spouseSex (married, death-year mode: ignored)', mdet, set(mdet, 'grantor', { spouseSex: 'male' }), { idgt: 'same', ing: 'same' }],
    ['grantor.spouseAge (single: ignored)', base, set(base, 'grantor', { spouseAge: '80' }), { idgt: 'same', ing: 'same' }],
    ['grantor.spouseSex (single: ignored)', base, set(base, 'grantor', { spouseSex: 'male' }), { idgt: 'same', ing: 'same' }],
    ['grantor.portability (single: ignored)', base, set(base, 'grantor', { portability: false }), { idgt: 'same', ing: 'same' }],
    ['grantor.spouseDeathYear (single: ignored)', set(base, 'grantor', { useDeathYear: true }), set(base, 'grantor', { useDeathYear: true, spouseDeathYear: '3' }), { idgt: 'same', ing: 'same' }],
    ['estate.spousePriorGifts (married, spouse first: DSUE $15M → $3M)', set(mSpouseFirst, 'estate', { spousePriorGifts: '0' }), mSpouseFirst, { idgt: 'moves', ing: 'moves' }],
    ['estate.spousePriorGiftYear (married: $12M above the 2019 exclusion)', mSpouseFirst, set(mSpouseFirst, 'estate', { spousePriorGiftYear: '2019' }), { idgt: 'moves', ing: 'moves' }],
    ['estate.spousePriorExclusionMode + spousePriorGiftExclusion (married)', mSpouseFirst, set(mSpouseFirst, 'estate', { spousePriorExclusionMode: 'custom', spousePriorGiftExclusion: '11000000' }), { idgt: 'moves', ing: 'moves' }],
    ['estate.spousePriorGiftYear (married, no spouse gifts: ignored)', mbase, set(mbase, 'estate', { spousePriorGiftYear: '2019' }), { idgt: 'same', ing: 'same' }],
    ['estate.spousePriorGifts (single: ignored)', base, set(base, 'estate', { spousePriorGifts: '10000000' }), { idgt: 'same', ing: 'same' }],
    ['estate.otherEstate (married)', mbase, set(mbase, 'estate', { otherEstate: '60000000' }), { idgt: 'moves', ing: 'moves' }],
    ['settings.burnShare (married)', mbase, set(mbase, 'settings', { burnShare: '50' }), { idgt: 'moves', ing: 'same' }],
    ['settings.ingAdminRate (married)', mbase, set(mbase, 'settings', { ingAdminRate: '0.5' }), { idgt: 'same', ing: 'moves' }],
    ['asset.basis (married: both keep and ING stepped up)', mbase, set(mbase, 'asset', { basis: '500000' }), { idgt: 'moves', ing: 'same' }],
    ['estate.beneFedLtcg (married)', mbase, set(mbase, 'estate', { beneFedLtcg: '15' }), { idgt: 'moves', ing: 'same' }],
    // estate and transfer tax
    ['estate.otherEstate (straddling estate)', straddle, set(straddle, 'estate', { otherEstate: '9000000' }), { idgt: 'moves', ing: 'moves' }],
    ['estate.otherEstate (taxable every year either way: NPV independent of size)', base, set(base, 'estate', { otherEstate: '14000000' }), { idgt: 'same', ing: 'same' }],
    ['estate.otherEstateGrowth', base, set(base, 'estate', { otherEstateGrowth: '5' }), { idgt: 'moves', ing: 'moves' }],
    ['estate.exclusion (straddling estate)', straddle, set(straddle, 'estate', { exclusion: '12000000' }), { idgt: 'moves', ing: 'moves' }],
    ['estate.exclusion (taxable every year either way: NPV unchanged)', base, set(base, 'estate', { exclusion: '12000000' }), { idgt: 'same', ing: 'same' }],
    ['estate.exclusionIndexing (straddling estate)', straddle, set(straddle, 'estate', { exclusionIndexing: '3' }), { idgt: 'moves', ing: 'moves' }],
    ['estate.priorGifts (straddling estate)', straddle, set(straddle, 'estate', { priorGifts: '15000000' }), { idgt: 'moves', ing: 'moves' }],
    ['estate.priorGiftYear (straddling estate)', straddlePrior, set(straddlePrior, 'estate', { priorGiftYear: '2019' }), { idgt: 'moves', ing: 'moves' }],
    ['estate.priorExclusionMode + priorGiftExclusion (straddling estate)', straddlePrior, set(straddlePrior, 'estate', { priorExclusionMode: 'custom', priorGiftExclusion: '11000000' }), { idgt: 'moves', ing: 'moves' }],
    ['estate.priorGiftYear (no prior gifts: ignored)', base, set(base, 'estate', { priorGiftYear: '2019' }), { idgt: 'same', ing: 'same' }],
    ['estate.estateTaxRate', base, set(base, 'estate', { estateTaxRate: '45' }), { idgt: 'moves', ing: 'moves' }],
    ['estate.beneFedLtcg', base, set(base, 'estate', { beneFedLtcg: '15' }), { idgt: 'moves', ing: 'same' }],
    ['estate.beneStateLtcg', base, set(base, 'estate', { beneStateLtcg: '0' }), { idgt: 'moves', ing: 'same' }],
    ['estate.beneNiit', base, set(base, 'estate', { beneNiit: false }), { idgt: 'moves', ing: 'same' }],
    ['estate.yearsToSale', base, set(base, 'estate', { yearsToSale: '5' }), { idgt: 'moves', ing: 'same' }],
    ['estate.discountRate', base, set(base, 'estate', { discountRate: '6' }), { idgt: 'moves', ing: 'moves' }],
    ['estate.maxYears (display only)', base, set(base, 'estate', { maxYears: '10' }), { idgt: 'same', ing: 'same' }],
    ['settings.rankKey (ranking only)', base, set(base, 'settings', { rankKey: 'none' }), { idgt: 'same', ing: 'same' }],
    ['settings.discountAtDeath (discount 30%)', withDiscount, set(withDiscount, 'settings', { discountAtDeath: true }), { idgt: 'moves', ing: 'moves' }],
    ['settings.discountAtDeath (no discount: ignored)', base, set(base, 'settings', { discountAtDeath: true }), { idgt: 'same', ing: 'same' }],
    ['settings.saleAppliesToBaseline (sale)', withSale, set(withSale, 'settings', { saleAppliesToBaseline: false }), { idgt: 'moves', ing: 'moves' }],
    ['settings.saleAppliesToBaseline (no sale: ignored)', base, set(base, 'settings', { saleAppliesToBaseline: false }), { idgt: 'same', ing: 'same' }],
    ['settings.swapCustom (non-neutral values)', base, withCustom, { idgt: 'moves', ing: 'same' }],
    ['settings.swapCustom switched on at non-default rates, values untouched (must stay neutral)', hiState, hiStateCustomOn, { idgt: 'same', ing: 'same' }],
    ['settings.swapCustom switched on with a shrinking other estate (−1%), values untouched', shrinking, shrinkingCustomOn, { idgt: 'same', ing: 'same' }],
    ['estate "exclusion fully used in 2023" shortcut (straddling estate)', straddle, exhausted2023, { idgt: 'moves', ing: 'moves' }],
    ['settings.swapCustom (off: custom values ignored)', base, set(base, 'settings', { swapBasisPct: '10', swapGrowth: '9' }), { idgt: 'same', ing: 'same' }],
    ['settings.swapBasisPct', withCustom, set(withCustom, 'settings', { swapBasisPct: '20' }), { idgt: 'moves', ing: 'same' }],
    ['settings.swapGrowth', withCustom, set(withCustom, 'settings', { swapGrowth: '7' }), { idgt: 'moves', ing: 'same' }],
    ['settings.swapYield', withCustom, set(withCustom, 'settings', { swapYield: '3' }), { idgt: 'moves', ing: 'same' }],
    ['settings.swapTaxRate', withCustom, set(withCustom, 'settings', { swapTaxRate: '30' }), { idgt: 'moves', ing: 'same' }],
    ['settings.burnShare', base, set(base, 'settings', { burnShare: '50' }), { idgt: 'moves', ing: 'same' }],
    ['settings.ingFedOrd', base, set(base, 'settings', { ingFedOrd: '35' }), { idgt: 'same', ing: 'moves' }],
    ['settings.ingFedLtcg (sale)', withSale, set(withSale, 'settings', { ingFedLtcg: '15' }), { idgt: 'same', ing: 'moves' }],
    ['settings.ingStateRate', base, set(base, 'settings', { ingStateRate: '4' }), { idgt: 'same', ing: 'moves' }],
    ['settings.ingAdminRate', base, set(base, 'settings', { ingAdminRate: '0.5' }), { idgt: 'same', ing: 'moves' }],
    ['settings.ingStateTaxOnGrantor', base, set(base, 'settings', { ingStateTaxOnGrantor: true }), { idgt: 'same', ing: 'moves' }],
    ['asset.fmv', base, set(base, 'asset', { fmv: '2000000' }), { idgt: 'moves', ing: 'moves' }],
    ['asset.discount', base, set(base, 'asset', { discount: '20' }), { idgt: 'moves', ing: 'same' }],
    ['asset.basis', base, set(base, 'asset', { basis: '500000' }), { idgt: 'moves', ing: 'same' }],
    ['asset.growth', base, set(base, 'asset', { growth: '9' }), { idgt: 'moves', ing: 'moves' }],
    ['asset.yield', base, set(base, 'asset', { yield: '4' }), { idgt: 'moves', ing: 'moves' }],
    ['asset.saleYear', base, set(base, 'asset', { saleYear: '3' }), { idgt: 'moves', ing: 'moves' }],
    ['asset.postSaleGrowth (sale)', withSale, set(withSale, 'asset', { postSaleGrowth: '8' }), { idgt: 'moves', ing: 'moves' }],
    ['asset.postSaleYield (sale)', withSale, set(withSale, 'asset', { postSaleYield: '4' }), { idgt: 'moves', ing: 'moves' }],
    ['asset.annualExclusions', base, set(base, 'asset', { annualExclusions: '190000' }), { idgt: 'moves', ing: 'same' }],
    ['asset.source (label for the inputs audit only)', base, set(base, 'asset', { source: 'Excel B7' }), { idgt: 'same', ing: 'same' }],
  ];
  const wiring = [];
  const runState = (st) => runPipeline({ grantor: st.grantor, estate: st.estate, settings: st.settings, assets: [st.asset] });
  for (const [control, from, to, expect] of CONTROLS) {
    const a = runState(from).perAsset[0]; const b = runState(to).perAsset[0];
    if (!a.result || !b.result) { record(LU, `control: ${control} evaluates`, false, { control, errors: [...a.errors, ...b.errors] }); continue; }
    const moved = { idgt: !(closeMoney(a.result.npvNone, b.result.npvNone) && closeMoney(a.result.npvOpt, b.result.npvOpt)), ing: !closeMoney(a.ing.npv, b.ing.npv) };
    for (const k of ['idgt', 'ing']) {
      record(LU, `control: ${control} → ${k.toUpperCase()} ${expect[k]}`, (expect[k] === 'moves') === moved[k], { control, output: k, expected: expect[k], moved: moved[k] });
    }
    // the after-state through the app pipeline must agree with the oracle driven from the planner-facing meaning
    const want = expectedEngineInputs({ grantor: to.grantor, estate: to.estate, settings: to.settings, asset: to.asset });
    const O = oracleFor(want);
    const ok = closeMoney(b.result.npvNone, O.npvNone) && closeMoney(b.result.npvOpt, O.npvOpt) && closeMoney(b.ing.npv, O.ingNpv);
    record(LU, `control: ${control} → pipeline = oracle`, ok, { control, npvNone: [b.result.npvNone, O.npvNone], npvOpt: [b.result.npvOpt, O.npvOpt], ing: [b.ing.npv, O.ingNpv] });
    wiring.push({ control, expect, moved, npvNone: b.result.npvNone, npvOpt: b.result.npvOpt, ing: b.ing.npv, oracle: { npvNone: O.npvNone, npvOpt: O.npvOpt, ing: O.ingNpv }, agrees: ok });
  }

  // What the grantor panel says about the table and the life expectancies (src/hooks/computeModel.js → GrantorPanel).
  const expectationStates = [['single, SSA 2023', base], ['married, SSA 2023', mbase], ['single, legacy 2021', set(base, 'grantor', { lifeTable: 'ssa-2021-legacy' })], ['married, legacy 2021', set(mbase, 'grantor', { lifeTable: 'ssa-2021-legacy' })]];
  for (const [name, st] of expectationStates) {
    const m = runState(st).mortality;
    const want = expectedEngineInputs({ ...st });
    const table = LIFE_TABLE_BY_ID[want.lifeTableId];
    const eG = lifeExpectancy(deathDistribution({ lx: want.lx, age: want.age }).q);
    record(LU, `panel: table name and verification flag (${name})`, m.table.id === want.lifeTableId && m.table.verified === (want.lifeTableId === DEFAULT_TABLE) && m.table.label === table.label, { name, shown: m.table });
    record(LU, `panel: grantor life expectancy = oracle (${name})`, Math.abs(m.grantorYears - eG) <= 1e-9, { name, shown: m.grantorYears, oracle: eG });
    if (want.married) {
      const qS = deathDistribution({ lx: want.lxSpouse, age: want.ageSpouse }).q;
      const qL = secondDeathByPairs(deathDistribution({ lx: want.lx, age: want.age }).q, qS);
      record(LU, `panel: spouse and second-death life expectancies = oracle (${name})`, Math.abs(m.spouseYears - lifeExpectancy(qS)) <= 1e-9 && Math.abs(m.secondDeathYears - lifeExpectancy(qL)) <= 1e-9,
        { name, shown: [m.spouseYears, m.secondDeathYears], oracle: [lifeExpectancy(qS), lifeExpectancy(qL)] });
    }
  }

  // Multi-asset ranking through the pipeline vs the oracle's ranking (single grantor and married couple).
  for (const married of [false, true]) {
    for (const rankKey of ['opt', 'none']) {
      const assets = [DEFAULTS.asset, ...PERSONAS.slice(1, 7).map((p) => p.asset)].map((a, i) => ({ ...a, id: `r${i}` }));
      const grantor = married ? { ...DEFAULTS.grantor, married: true } : DEFAULTS.grantor;
      const st = { grantor, estate: DEFAULTS.estate, settings: { ...DEFAULTS.settings, rankKey }, assets };
      const out = runPipeline(st);
      const items = out.perAsset.filter((p) => p.result).map((p) => {
        const O = oracleFor(expectedEngineInputs({ ...st, asset: assets.find((a) => a.id === p.id) }));
        return { id: p.id, npvNone: O.npvNone, npvOpt: O.npvOpt, eff: O.eff, Ug: O.facts.Ug };
      });
      const want = oracleRank(items, rankKey, out.remainingExclusion);
      const ok = want.every((w) => { const g = out.ranked.find((r) => r.id === w.id); return g && g.rank === w.rank && closeMoney(g.cumulativeTaxableGift, w.cumulative) && g.exceedsRemainingExclusion === w.exceeds; });
      record(LU, `portfolio ranking (${married ? 'married, ' : ''}${rankKey})`, ok, { rankKey, married, engine: out.ranked.map((r) => r.id), oracle: want.map((w) => w.id) });
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // L6 — breakevens, grid, reference data
  const LB = 'L6 breakevens & data';
  const withStateRate = (inp, sg) => ({ ...inp, tauOrd: inp.tauOrd - inp.stateOrd + sg, tauCg: inp.tauCg - inp.stateCg + sg, stateOrd: sg, stateCg: sg });
  const singles = valid.filter((v) => !v.inp.married);
  const smallCouples = valid.filter((v) => v.inp.married && v.res.derived.NG * v.res.derived.NS <= 1600);
  const pickEvery = (arr, k) => arr.filter((_, i) => i % Math.max(1, Math.floor(arr.length / k)) === 0).slice(0, k);
  const beCases = [...pickEvery(singles, QUICK ? 4 : 12), ...pickEvery(smallCouples, QUICK ? 1 : 4)];
  for (const { c, inp } of beCases) {
    const be = engine.breakevens(inp);
    const T = { burnShare: (x) => ({ ...inp, burnShare: x }), stateRate: (x) => withStateRate(inp, x), otherEstate: (x) => ({ ...inp, E0: x }) };
    const tag = inp.married ? ' (married)' : '';
    for (const key of ['burnShare', 'stateRate', 'otherEstate']) {
      const r = be[key];
      if (r.value != null && r.bracket) {
        const fl = oracleDelta(T[key](r.bracket.lo)); const fh = oracleDelta(T[key](r.bracket.hi));
        record(LB, `breakeven ${key}${tag}: bracket straddles an oracle sign change`, Math.sign(fl) !== Math.sign(fh) || fl === 0 || fh === 0, { id: c.id, value: r.value, fl, fh });
        record(LB, `breakeven ${key}${tag}: side reported above the root matches the oracle`, r.ingWinsAbove === (fh > 0), { id: c.id, ingWinsAbove: r.ingWinsAbove, fh });
      } else if (r.reason === engine.REASON_ING_ALWAYS || r.reason === engine.REASON_IDGT_ALWAYS) {
        const [lo, hi] = key === 'burnShare' ? [0, 1] : key === 'stateRate' ? [0, 0.2] : [0, Math.max(3 * inp.E0, 5 * inp.X0)];
        const pts = [lo, (lo + hi) / 2, hi].map((x) => oracleDelta(T[key](x)));
        const want = r.reason === engine.REASON_ING_ALWAYS ? 1 : -1;
        record(LB, `breakeven ${key}${tag}: "always" reading agrees with the oracle at ends and midpoint`, pts.every((p) => Math.sign(p) === want), { id: c.id, reason: r.reason, pts });
      }
    }
  }
  const gridCases = [...pickEvery(singles, QUICK ? 1 : 3), ...(QUICK ? [] : pickEvery(valid.filter((v) => v.inp.married && v.res.derived.NG * v.res.derived.NS <= 500), 1))];
  for (const { c, inp } of gridCases) {
    const grid = engine.comparisonGrid(inp);
    let bad = null;
    grid.burnShares.forEach((phi, i) => grid.stateRates.forEach((sg, j) => {
      const cellInp = j === grid.own.col ? { ...inp, burnShare: phi } : { ...withStateRate(inp, sg), burnShare: phi };
      const want = oracleDelta(cellInp);
      if (!closeMoney(grid.cells[i][j], want, inp.E0)) bad ??= { phi, sg, engine: grid.cells[i][j], oracle: want };
    }));
    record(LB, `breakeven grid cells = oracle Δ${inp.married ? ' (married)' : ''}`, !bad, { id: c.id, ...bad });
  }
  // Reference data: basic exclusion by year
  for (const [y, amt] of Object.entries(BEA_BY_YEAR)) {
    record(LB, `basic exclusion ${y}`, BASIC_EXCLUSION_BY_YEAR[y] === amt, { year: y, app: BASIC_EXCLUSION_BY_YEAR[y], revProc: amt });
  }

  // Life tables: the default table is the published SSA 2023 period table, byte for byte; the legacy one is flagged.
  const csv = ssa2023FromCsv();
  const module = defaultTable.data;
  let firstDiff = null; let compared = 0;
  for (const sex of ['male', 'female']) for (const col of ['q', 'l', 'e']) for (let x = 0; x < TERMINAL_AGE; x += 1) {
    compared += 1;
    if (module[sex][col][x] !== csv[sex][col][x]) firstDiff ??= { sex, col, age: x, module: module[sex][col][x], csv: csv[sex][col][x] };
  }
  record(LB, `life table: src/data module = extracted source CSV (${compared} published values)`, !firstDiff && compared === 720, firstDiff ?? { compared });
  const pdfHash = createHash('sha256').update(readFileSync(SSA_2023_PDF)).digest('hex');
  record(LB, 'life table: source PDF is the one the registry records (SHA-256)', pdfHash === SSA_2023_PDF_SHA256 && defaultTable.provenance.includes(pdfHash), { pdfHash });
  for (const sex of ['male', 'female']) {
    const derived = survivorsFromRates(sex);
    const worstL = Math.max(...csv[sex].l.map((l, x) => Math.abs(derived[x] - l)));
    record(LB, `life table: survivors from the published q within 1 life of the published l (${sex}, ages 0–119)`, worstL <= 1, { sex, worstL });
    let worstE = 0; let at = null;
    for (let x = 1; x <= 110; x += 1) {
      const diff = Math.abs(lifeExpectancy(deathYearsFromRates(sex, x)) - csv[sex].e[x]);
      if (diff > worstE) { worstE = diff; at = x; }
    }
    record(LB, `life table: life expectancy from q = published e_x within 0.01 (${sex}, ages 1–110)`, worstE <= 0.01, { sex, worstE, at });
    const eng = engine.lxFromLifeTable(defaultTable, sex);
    for (const [age, l] of Object.entries(defaultTable.checksum[sex])) {
      record(LB, 'life table: registry checksums = published survivors (±1 life)', Math.abs(eng[age] - l) <= 1 && csv[sex].l[age] === l, { sex, age, engine: eng[age], published: l });
    }
  }
  record(LB, 'mortality: the default life table is verified against its published source', defaultTable.verified === true && DEFAULT_LIFE_TABLE_ID === DEFAULT_TABLE && !firstDiff && pdfHash === SSA_2023_PDF_SHA256, { id: DEFAULT_LIFE_TABLE_ID });
  const legacy = LIFE_TABLE_BY_ID['ssa-2021-legacy'];
  const legacyShown = runState(set(base, 'grantor', { lifeTable: 'ssa-2021-legacy' })).mortality.table;
  record(LB, 'mortality: the legacy 2021 table is flagged unverified and the app says so', legacy.verified === false && legacyShown.verified === false && /unverified/i.test(legacyShown.label), { shown: legacyShown });
  record(LB, 'mortality: every registry table has a source, a check date and a verification flag', LIFE_TABLES.every((t) => t.sourceUrl && t.checkedOn !== undefined && typeof t.verified === 'boolean' && t.provenance), {});
  // Death-year probabilities at every age, both sexes: engine (registry → survivors → differences) vs oracle (product of q).
  for (const sex of ['male', 'female']) {
    const lx = engine.lxFromLifeTable(defaultTable, sex);
    let bad = null;
    for (let age = 0; age < TERMINAL_AGE; age += 1) {
      const e = engine.deathProbabilities({ lx, age });
      const o = deathYearsFromRates(sex, age);
      if (!(e.N === TERMINAL_AGE - age && closeProbs(e.q, o))) bad ??= { age, N: e.N, want: TERMINAL_AGE - age };
      record(LB, `mortality: death-year probabilities = Π(1 − q)·q from the published column (${sex}, every age 0–119)`, e.N === TERMINAL_AGE - age && closeProbs(e.q, o), { sex, age, N: e.N });
    }
    const legacyLx = Object.keys(SSA_2021_LX).map(Number).sort((a, b) => a - b).map((a) => SSA_2021_LX[a][sex]);
    record(LB, `mortality: legacy table radix 100,000, non-increasing, 120 ages (${sex})`, legacyLx.length === 120 && legacyLx[0] === 100000 && legacyLx.every((x, i) => i === 0 || x <= legacyLx[i - 1]), {});
    for (const age of [40, 65, 90]) {
      record(LB, `mortality: legacy table death-year probabilities = oracle (${sex})`, closeProbs(engine.deathProbabilities({ lx: engine.lxFromLifeTable(legacy, sex), age }).q, deathDistribution({ lx: legacyLx, age }).q), { sex, age });
    }
  }
  // Joint lives: second death on a grid of ages × all four sex pairings — engine vs the explicit double sum.
  const AGES = QUICK ? [35, 65, 85, 105, 119] : [25, 35, 45, 55, 65, 75, 85, 95, 105, 115, 119];
  for (const aG of AGES) for (const aS of AGES) for (const [sG, sS] of [['male', 'female'], ['female', 'male'], ['male', 'male'], ['female', 'female']]) {
    const lives = engine.marriedLives({ lx: engine.lxFromLifeTable(defaultTable, sG), age: aG, lxSpouse: engine.lxFromLifeTable(defaultTable, sS), ageSpouse: aS, deathYearOverride: null });
    const qG = deathYearsFromRates(sG, aG); const qS = deathYearsFromRates(sS, aS);
    const qL = secondDeathByPairs(qG, qS);
    const id = `${aG}${sG[0].toUpperCase()}/${aS}${sS[0].toUpperCase()}`;
    record(LB, 'mortality: joint lives — q^G, q^S and the second-death distribution = oracle double sum (ages × sexes)', closeProbs(lives.qG, qG) && closeProbs(lives.qS, qS) && closeProbs(lives.qL, qL), { id });
    const mean = (q) => q.reduce((a, p, k) => a + p * (k + 1), 0);
    record(LB, 'mortality: joint lives — Σ q^L = 1 and E[T_L] ≥ max(E[T_G], E[T_S])', Math.abs(lives.qL.reduce((a, b) => a + b, 0) - 1) <= 1e-12 && mean(lives.qL) >= Math.max(mean(qG), mean(qS)) - 1e-12, { id });
  }

  // ---------------------------------------------------------------------------------------------------------
  // Report
  const list = [...checks.values()];
  const layers = {};
  for (const c of list) {
    layers[c.layer] ??= { checks: 0, failingChecks: 0, assertions: 0, failures: 0 };
    const L = layers[c.layer];
    L.checks += 1; L.assertions += c.pass + c.fail; L.failures += c.fail; if (c.fail) L.failingChecks += 1;
  }
  const failing = list.filter((c) => c.fail > 0).sort((a, b) => a.layer.localeCompare(b.layer) || b.fail - a.fail);
  const summary = {
    label: LABEL, seed: SEED, sweep: N_SWEEP, personas: PERSONAS.length, handCases: HAND_CASES.length + MORTALITY_HAND_CASES.length,
    scenariosEvaluated: valid.length, scenariosMarried: valid.filter((v) => v.inp.married).length,
    marriedFullCurve: valid.filter((v) => v.inp.married && !v.sampled).length,
    scenariosRejected: rejected.length, scenariosWithAnyFailure: valid.filter((v) => v.failed).length,
    pipeline: PIPELINE_SOURCE, seconds: (Date.now() - t0) / 1000,
    totals: { checks: list.length, failingChecks: failing.length, assertions: list.reduce((a, c) => a + c.pass + c.fail, 0), failures: list.reduce((a, c) => a + c.fail, 0) },
    layers,
  };
  summary.blocked = blocked.length;
  const out = { summary, failing, blocked, jumps, rejected: rejected.slice(0, 50), rejectedReasons: Object.entries(rejected.flatMap((r) => r.errors.map((e) => e.split(':')[0])).reduce((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {})), tagStats, wiring, checks: list.map((c) => ({ layer: c.layer, name: c.name, pass: c.pass, fail: c.fail })) };
  if (write) {
    mkdirSync(join(HERE, 'results'), { recursive: true });
    writeFileSync(join(HERE, 'results', `${LABEL}.json`), JSON.stringify(out, null, 2));
  }
  return { ...out, failingExamples: failing };
}
