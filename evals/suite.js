// IDGT calculator eval suite — see evals/README.md for the methodology. CLI: evals/run.mjs; CI: evals/evals.test.js.
//
// Six layers, all graded by code (no human or model judgement in the loop):
//   L1 hand calculations      closed-form answers a reviewer can redo on paper; grade engine AND oracle
//   L2 oracle agreement       engine vs the clean-room statutory oracle on named personas + a stratified sweep
//   L3 invariants & theorems  identities and economic theorems that must hold on every scenario
//   L4 metamorphic            scale invariance, toggle identities, discontinuity scans
//   L5 UI wiring              every field and toggle: mapping, sensitivity, full-pipeline agreement, ranking
//   L6 breakevens & data      breakeven roots bracket a real sign change; grid cells; reference tables
// runEvals() returns every check with its pass/fail counts and the first failing examples.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as engine from '../src/engine/index.js';
import { buildEngineInputs, validateUiFields } from '../src/hooks/buildInputs.js';
import { BASIC_EXCLUSION_BY_YEAR } from '../src/data/exclusionAmounts.js';
import { MORTALITY_TABLE_META, SSA_2021_LX } from '../src/data/mortalityTable.js';
import { makeScenarios } from './scenarios/generator.js';
import { PERSONAS, DEFAULTS } from './scenarios/personas.js';
import { HAND_CASES } from './scenarios/handcalc.js';
import { expectedEngineInputs, BEA_BY_YEAR } from './oracle/ui.js';
import { oracleEvaluate, oracleIng, oracleRank, deathDistribution } from './oracle/evaluate.js';
import { engineView, oracleView, readPath } from './graders/views.js';
import { runPipeline, PIPELINE_SOURCE } from './graders/pipeline.js';

// The deathbed-swap tile's sub-line (src/components/format.js once F3 is fixed; the pre-fix text otherwise).
let deathbedNote = null;
try { ({ deathbedNote } = await import('../src/components/format.js')); } catch { /* pre-fix build */ }

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SEED = 20260927;

/**
 * Run every layer.
 * @param {{ label?:string, n?:number, seed?:number, quick?:boolean, write?:boolean }} [opts]
 *   quick — a reduced sweep and subsets (≈ 10 s) for CI; write — save results/<label>.json
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
  
  // ---------------------------------------------------------------------------------------------------------
  // L1 — hand calculations
  for (const hc of HAND_CASES) {
    let ev; let ov;
    try {
      const res = engine.evaluateAsset(hc.inputs);
      ev = engineView(res, engine.evaluateIng(hc.inputs, res));
    } catch (e) { record('L1 hand calc', `${hc.id} engine runs`, false, { id: hc.id, error: e.message }); continue; }
    const o = oracleEvaluate(hc.inputs);
    ov = oracleView(o, oracleIng(hc.inputs, o));
    for (const [path, expected] of Object.entries(hc.expect)) {
      for (const [who, view] of [['engine', ev], ['oracle', ov]]) {
        const got = path === 'expectedDeathYear' ? view.expectedDeathYear : readPath(view, path);
        const ok = typeof expected === 'number' && path !== 'sStar' ? closeMoney(got, expected) : got === expected;
        record('L1 hand calc', `${who}: ${hc.id} ${path}`, ok, { id: hc.id, title: hc.title, path, expected, got, diff: typeof got === 'number' ? got - expected : null });
      }
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // L2 — oracle agreement on personas and the stratified sweep
  function compareViews(id, ev, ov, scale, layer = 'L2 oracle agreement') {
    const d = (name, a, b, extra = {}) => record(layer, name, closeMoney(a, b, scale), { id, engine: a, oracle: b, diff: a - b, ...extra });
    for (const k of ['Ug', 'R', 'Uc', 'G', 'BT0']) d(`derived.${k}`, ev.derived[k], ov.derived[k]);
    record(layer, 'horizon N', ev.N === ov.N, { id, engine: ev.N, oracle: ov.N });
    record(layer, 'death probabilities q', ev.q.length === ov.q.length && ev.q.every((x, i) => Math.abs(x - ov.q[i]) <= 1e-15), { id });
    record(layer, 'expected death year', closeRatio(ev.expectedDeathYear, ov.expectedDeathYear), { id, engine: ev.expectedDeathYear, oracle: ov.expectedDeathYear });
    d('NPV no swap', ev.npvNone, ov.npvNone);
    let curveOk = true; let feasOk = true; let first = null;
    for (let i = 0; i < ov.curve.length; i += 1) {
      const a = ev.curve[i]; const b = ov.curve[i];
      if (!a || a.feasible !== b.feasible) { feasOk = false; first ??= { s: b.s, engine: a?.feasible, oracle: b.feasible }; continue; }
      if (b.feasible && !closeMoney(a.npv, b.npv, scale)) { curveOk = false; first ??= { s: b.s, engine: a.npv, oracle: b.npv, diff: a.npv - b.npv }; }
    }
    record(layer, 'swap-year feasibility', feasOk, { id, first });
    record(layer, 'NPV by swap year (whole curve)', curveOk, { id, first });
    // s*: must match, or the engine's choice must be a tie with the oracle's optimum under the documented tolerance
    const oAtEngine = ov.curve.find((c) => c.s === ev.sStar);
    const tieTol = 2e-6 * Math.max(1, Math.abs(ov.maxNpv));
    const sOk = ev.sStar === ov.sStar || (oAtEngine?.feasible && ov.maxNpv - oAtEngine.npv <= tieTol);
    record(layer, 'optimal swap year s*', sOk, { id, engine: ev.sStar, oracle: ov.sStar });
    d('NPV at s*', ev.npvOpt, oAtEngine?.npv ?? NaN);
    d('deathbed-swap value', ev.npvPF, ov.npvPF);
    for (const k of ['none', 'opt']) {
      record(layer, `NPV per $ taxable gift (${k})`, closeRatio(ev.eff[k], k === 'opt' && ev.eff.opt != null ? (oAtEngine?.npv ?? NaN) / ov.derived.Ug : ov.eff[k]), { id, engine: ev.eff[k], oracle: ov.eff[k] });
    }
    const rowKeys = ['V', 'Vs', 'Eb', 'Es', 'T', 'TEb', 'TEs', 'ETb', 'ETs', 'SUb', 'SUs', 'Hb', 'Hs', 'dH'];
    for (const [label, er, orr] of [['ledger (no swap)', ev.rowsNone, ov.rowsNone], ['ledger (s*)', ev.rowsOpt, ov.rowsOpt]]) {
      const bad = {};
      er.forEach((row, i) => {
        for (const k of rowKeys) if (!closeMoney(row[k], orr[i][k], scale)) bad[k] ??= { t: row.t, engine: row[k], oracle: orr[i][k], diff: row[k] - orr[i][k] };
      });
      for (const k of rowKeys) record(layer, `${label}: ${k}`, !bad[k], { id, ...bad[k] });
    }
    if (ev.ing && ov.ing) {
      d('ING NPV', ev.ing.npv, ov.ing.npv);
      d('ING minus IDGT (best swap)', ev.ing.deltaOpt, ov.ing.deltaOpt);
      d('ING minus IDGT (no swap)', ev.ing.deltaNone, ov.ing.deltaNone);
      const clear = Math.abs(ov.ing.deltaOpt) > 1e-5 * Math.max(1, Math.abs(ov.npvOpt));
      record(layer, 'ING verdict', !clear || ev.ing.verdict === ov.ing.verdict, { id, engine: ev.ing.verdict, oracle: ov.ing.verdict, delta: ov.ing.deltaOpt });
      const bad = {};
      ev.ing.rows.forEach((row, i) => {
        for (const k of ['Vn', 'En', 'TEn', 'ETn', 'SUn', 'Hn', 'dH']) if (!closeMoney(row[k], ov.ing.rows[i][k], scale)) bad[k] ??= { t: row.t, engine: row[k], oracle: ov.ing.rows[i][k], diff: row[k] - ov.ing.rows[i][k] };
      });
      for (const k of ['Vn', 'En', 'TEn', 'ETn', 'SUn', 'Hn', 'dH']) record(layer, `ING ledger: ${k}`, !bad[k], { id, ...bad[k] });
    }
  }

  function warningsCheck(id, inp, res, ing, o, oi) {
    const codes = new Set(res.warnings.map((w) => w.code));
    const L = 'L3 invariants & theorems';
    record(L, 'warning BUILT_IN_LOSS iff basis > FMV', codes.has('BUILT_IN_LOSS') === (inp.B0 > inp.FMV), { id });
    record(L, 'warning ZERO_TAXABLE_GIFT iff taxable gift = 0', codes.has('ZERO_TAXABLE_GIFT') === !(o.facts.Ug > 0), { id });
    record(L, 'warning PRIOR_GIFT_TAX iff prior gifts exceeded their exclusion', codes.has('PRIOR_GIFT_TAX') === (inp.P > 0 && inp.P > inp.XP), { id });
    record(L, 'warning SALE_BEYOND_HORIZON iff S > N', codes.has('SALE_BEYOND_HORIZON') === (inp.S > o.N), { id });
    const illiquid = o.sims[0].rows.some((r) => r.E < 0) || (o.sStar > 0 && o.sims[o.sStar].rows.some((r) => r.E < 0));
    record(L, 'warning GRANTOR_ILLIQUID iff the other estate goes negative', codes.has('GRANTOR_ILLIQUID') === illiquid, { id });
    if (ing) {
      const ingCodes = new Set(ing.warnings.map((w) => w.code));
      const liquidates = oi.rows.some((r) => r.liquidated);
      record(L, 'warning ING_FEE_EXCEEDS_YIELD iff the ING must liquidate to pay its fee', ingCodes.has('ING_FEE_EXCEEDS_YIELD') === liquidates, { id, warned: ingCodes.has('ING_FEE_EXCEEDS_YIELD'), liquidates });
    }
  }

  function theorems(id, inp, res, ing) {
    const L = 'L3 invariants & theorems';
    record(L, 'NPV(s*) ≥ NPV(no swap)', res.npvOpt >= res.npvNone - 1e-9 * Math.max(1, Math.abs(res.npvNone)), { id, npvOpt: res.npvOpt, npvNone: res.npvNone });
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    record(L, 'IDGT components sum to NPV (none)', closeMoney(sum(res.components.none), res.npvNone), { id });
    record(L, 'IDGT components sum to NPV (s*)', closeMoney(sum(res.components.opt), res.npvOpt), { id });
    if (ing) {
      record(L, 'ING components sum to ING NPV', closeMoney(sum(ing.components), ing.npv), { id });
      const b = ing.vsIdgt.bridge;
      record(L, 'bridge ends at the ING NPV', closeMoney(b.steps[b.steps.length - 1].to, ing.npv), { id });
    }
    // A swap cannot change outcomes for deaths before it happens.
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
  }

  const personaCases = PERSONAS.map((p) => ({ ...p, source: 'persona' }));
  const sweepCases = makeScenarios(N_SWEEP, SEED).map((s) => ({ ...s, source: 'sweep' }));
  const allCases = [...personaCases, ...sweepCases];
  const valid = []; // { c, inp, res, ing, o, oi }
  const rejected = [];
  const tagStats = {};

  for (const c of allCases) {
    const state = { grantor: c.grantor, estate: c.estate, settings: c.settings, asset: c.asset };
    // L5a — mapping: the app's UI → engine mapping equals the planner-facing meaning of every field
    const got = buildEngineInputs(state);
    const want = expectedEngineInputs(state);
    for (const [k, w] of Object.entries(want)) {
      const g = got[k];
      let ok;
      if (Array.isArray(w)) ok = Array.isArray(g) && g.length === w.length && g.every((x, i) => x === w[i]);
      else if (typeof w === 'number' && Number.isFinite(w)) ok = typeof g === 'number' && Math.abs(g - w) <= 1e-12 * Math.max(1, Math.abs(w));
      else if (typeof w === 'number') ok = typeof g === 'number' && Number.isNaN(g) === Number.isNaN(w);
      else ok = g === w;
      record('L5 UI wiring', `mapping: ${k}`, ok, { id: c.id, engine: Array.isArray(g) ? `[${g.length}]` : g, expected: Array.isArray(w) ? `[${w.length}]` : w });
    }
    const uiErrors = validateUiFields(state);
    const { errors } = engine.validateInputs(got);
    if (uiErrors.length || errors.length) { rejected.push({ id: c.id, tags: c.tags, errors: [...uiErrors, ...errors].map((e) => `${e.field}: ${e.message}`) }); continue; }
    let res; let ing;
    try { res = engine.evaluateAsset(got); ing = engine.evaluateIng(got, res); } catch (e) { record('L2 oracle agreement', 'engine evaluates valid input', false, { id: c.id, error: e.message }); continue; }
    const o = oracleEvaluate(want);
    const oi = oracleIng(want, o);
    const scale = Math.abs(got.E0) + Math.abs(got.FMV) + Math.max(...res.rows.none.map((r) => Math.abs(r.Hb)));
    const before = [...checks.values()].reduce((a, x) => a + x.fail, 0);
    compareViews(c.id, engineView(res, ing), oracleView(o, oi, res.sStar), scale);
    warningsCheck(c.id, got, res, ing, o, oi);
    theorems(c.id, got, res, ing);
    const failed = [...checks.values()].reduce((a, x) => a + x.fail, 0) > before;
    for (const tag of c.tags) { tagStats[tag] ??= { n: 0, failed: 0 }; tagStats[tag].n += 1; if (failed) tagStats[tag].failed += 1; }
    valid.push({ c, inp: got, res, ing, o, oi, failed });
  }

  // ---------------------------------------------------------------------------------------------------------
  // L4 — metamorphic
  const MONEY_FIELDS = ['FMV', 'B0', 'E0', 'X0', 'P', 'XP', 'annualExclusions'];
  const subset = valid.filter((_, i) => i % Math.max(1, Math.floor(valid.length / (QUICK ? 30 : 120))) === 0);
  const LM = 'L4 metamorphic';
  for (const { c, inp, res, ing } of subset) {
    // Homogeneity: every dollar input ×3 → every dollar output ×3, same swap year.
    const lam = 3;
    const scaled = { ...inp };
    for (const k of MONEY_FIELDS) scaled[k] = inp[k] * lam;
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
  const scanned = QUICK ? subset.slice(0, 10) : subset.slice(0, 40);
  function npvFns(inp, q, N) {
    return {
      idgt: (x) => engine.aggregate(engine.simulate(x, 0, N).rows, q).npv,
      ing: (x) => engine.simulateIng(x, N).rows.reduce((a, r, i) => a + q[i] * r.PV, 0),
    };
  }
  const jumps = [];
  for (const { c, inp, res } of scanned) {
    const fns = npvFns(inp, res.q, res.derived.N);
    for (const [field, range, which] of SCAN) {
      const [lo, hi] = range(inp);
      for (const kind of which === 'both' ? ['idgt', 'ing'] : [which]) {
        const f = (x) => fns[kind]({ ...inp, [field]: x });
        const n = 120;
        const xs = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
        const ys = xs.map(f);
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
        record(LM, `continuity of ${kind === 'ing' ? 'ING NPV' : 'IDGT NPV(none)'} in ${field}`, !found, { id: c.id, field, ...found });
        if (found) jumps.push({ id: c.id, kind, field, ...found });
      }
    }
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
  // [control, from-state, to-state, expectation per output: 'moves' | 'same']
  const CONTROLS = [
    ['grantor.age', base, set(base, 'grantor', { age: '72' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.sex', base, set(base, 'grantor', { sex: 'female' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.useDeathYear', base, set(base, 'grantor', { useDeathYear: true }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.deathYear', set(base, 'grantor', { useDeathYear: true }), set(base, 'grantor', { useDeathYear: true, deathYear: '9' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.deathYear (table mode: ignored)', base, set(base, 'grantor', { deathYear: '9' }), { idgt: 'same', ing: 'same' }],
    ['grantor.sex (death-year mode: ignored)', set(base, 'grantor', { useDeathYear: true }), set(base, 'grantor', { useDeathYear: true, sex: 'female' }), { idgt: 'same', ing: 'same' }],
    ['grantor.fedOrd', base, set(base, 'grantor', { fedOrd: '35' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.stateOrd', base, set(base, 'grantor', { stateOrd: '9.3' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.niit', base, set(base, 'grantor', { niit: '0' }), { idgt: 'moves', ing: 'moves' }],
    ['grantor.fedLtcg (trust sale, family would not sell)', withSaleOnlyTrust, set(withSaleOnlyTrust, 'grantor', { fedLtcg: '15' }), { idgt: 'moves', ing: 'same' }],
    ['grantor.stateLtcg (trust sale, family would not sell)', withSaleOnlyTrust, set(withSaleOnlyTrust, 'grantor', { stateLtcg: '2' }), { idgt: 'moves', ing: 'same' }],
    ['grantor.fedLtcg (sale in both worlds, same basis: gain tax cancels)', withSale, set(withSale, 'grantor', { fedLtcg: '15' }), { idgt: 'same', ing: 'moves' }],
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
  ];
  const wiring = [];
  for (const [control, from, to, expect] of CONTROLS) {
    const run = (st) => runPipeline({ grantor: st.grantor, estate: st.estate, settings: st.settings, assets: [st.asset] }).perAsset[0];
    const a = run(from); const b = run(to);
    if (!a.result || !b.result) { record(LU, `control: ${control} evaluates`, false, { control, errors: [...a.errors, ...b.errors] }); continue; }
    const moved = { idgt: !(closeMoney(a.result.npvNone, b.result.npvNone) && closeMoney(a.result.npvOpt, b.result.npvOpt)), ing: !closeMoney(a.ing.npv, b.ing.npv) };
    for (const k of ['idgt', 'ing']) {
      record(LU, `control: ${control} → ${k.toUpperCase()} ${expect[k]}`, (expect[k] === 'moves') === moved[k], { control, output: k, expected: expect[k], moved: moved[k] });
    }
    // the after-state through the app pipeline must agree with the oracle driven from the planner-facing meaning
    const want = expectedEngineInputs({ grantor: to.grantor, estate: to.estate, settings: to.settings, asset: to.asset });
    const o = oracleEvaluate(want); const oi = oracleIng(want, o);
    const ok = closeMoney(b.result.npvNone, o.npvNone) && closeMoney(b.result.npvOpt, o.npvOpt) && closeMoney(b.ing.npv, oi.npv);
    record(LU, `control: ${control} → pipeline = oracle`, ok, { control, npvNone: [b.result.npvNone, o.npvNone], npvOpt: [b.result.npvOpt, o.npvOpt], ing: [b.ing.npv, oi.npv] });
    wiring.push({ control, expect, moved, npvNone: b.result.npvNone, npvOpt: b.result.npvOpt, ing: b.ing.npv, oracle: { npvNone: o.npvNone, npvOpt: o.npvOpt, ing: oi.npv }, agrees: ok });
  }

  // Multi-asset ranking through the pipeline vs the oracle's ranking.
  for (const rankKey of ['opt', 'none']) {
    const assets = [DEFAULTS.asset, ...PERSONAS.slice(1, 7).map((p) => p.asset)].map((a, i) => ({ ...a, id: `r${i}` }));
    const st = { grantor: DEFAULTS.grantor, estate: DEFAULTS.estate, settings: { ...DEFAULTS.settings, rankKey }, assets };
    const out = runPipeline(st);
    const items = out.perAsset.filter((p) => p.result).map((p) => {
      const o = oracleEvaluate(expectedEngineInputs({ ...st, asset: assets.find((a) => a.id === p.id) }));
      return { id: p.id, npvNone: o.npvNone, npvOpt: o.npvOpt, eff: o.eff, Ug: o.facts.Ug };
    });
    const want = oracleRank(items, rankKey, out.remainingExclusion);
    const ok = want.every((w) => { const g = out.ranked.find((r) => r.id === w.id); return g && g.rank === w.rank && closeMoney(g.cumulativeTaxableGift, w.cumulative) && g.exceedsRemainingExclusion === w.exceeds; });
    record(LU, `portfolio ranking (${rankKey})`, ok, { rankKey, engine: out.ranked.map((r) => r.id), oracle: want.map((w) => w.id) });
  }

  // ---------------------------------------------------------------------------------------------------------
  // L6 — breakevens, grid, reference data
  const LB = 'L6 breakevens & data';
  const withStateRate = (inp, sg) => ({ ...inp, tauOrd: inp.tauOrd - inp.stateOrd + sg, tauCg: inp.tauCg - inp.stateCg + sg, stateOrd: sg, stateCg: sg });
  const oracleDelta = (inp) => { const o = oracleEvaluate(inp); return oracleIng(inp, o).deltaOpt; };
  const beCases = valid.filter((v) => v.inp.S === 0 || v.inp.S > 0).filter((_, i) => i % Math.max(1, Math.floor(valid.length / (QUICK ? 4 : 14))) === 0).slice(0, QUICK ? 4 : 14);
  for (const { c, inp } of beCases) {
    const be = engine.breakevens(inp);
    const T = { burnShare: (x) => ({ ...inp, burnShare: x }), stateRate: (x) => withStateRate(inp, x), otherEstate: (x) => ({ ...inp, E0: x }) };
    for (const key of ['burnShare', 'stateRate', 'otherEstate']) {
      const r = be[key];
      if (r.value != null && r.bracket) {
        const fl = oracleDelta(T[key](r.bracket.lo)); const fh = oracleDelta(T[key](r.bracket.hi));
        record(LB, `breakeven ${key}: bracket straddles an oracle sign change`, Math.sign(fl) !== Math.sign(fh) || fl === 0 || fh === 0, { id: c.id, value: r.value, fl, fh });
        record(LB, `breakeven ${key}: side reported above the root matches the oracle`, r.ingWinsAbove === (fh > 0), { id: c.id, ingWinsAbove: r.ingWinsAbove, fh });
      } else if (r.reason === engine.REASON_ING_ALWAYS || r.reason === engine.REASON_IDGT_ALWAYS) {
        const [lo, hi] = key === 'burnShare' ? [0, 1] : key === 'stateRate' ? [0, 0.2] : [0, Math.max(3 * inp.E0, 5 * inp.X0)];
        const pts = [lo, (lo + hi) / 2, hi].map((x) => oracleDelta(T[key](x)));
        const want = r.reason === engine.REASON_ING_ALWAYS ? 1 : -1;
        record(LB, `breakeven ${key}: "always" reading agrees with the oracle at ends and midpoint`, pts.every((p) => Math.sign(p) === want), { id: c.id, reason: r.reason, pts });
      }
    }
  }
  for (const { c, inp } of beCases.slice(0, QUICK ? 1 : 3)) {
    const grid = engine.comparisonGrid(inp);
    let bad = null;
    grid.burnShares.forEach((phi, i) => grid.stateRates.forEach((sg, j) => {
      const cellInp = j === grid.own.col ? { ...inp, burnShare: phi } : { ...withStateRate(inp, sg), burnShare: phi };
      const want = oracleDelta(cellInp);
      if (!closeMoney(grid.cells[i][j], want, inp.E0)) bad ??= { phi, sg, engine: grid.cells[i][j], oracle: want };
    }));
    record(LB, 'breakeven grid cells = oracle Δ', !bad, { id: c.id, ...bad });
  }
  // Reference data
  for (const [y, amt] of Object.entries(BEA_BY_YEAR)) {
    record(LB, `basic exclusion ${y}`, BASIC_EXCLUSION_BY_YEAR[y] === amt, { year: y, app: BASIC_EXCLUSION_BY_YEAR[y], revProc: amt });
  }
  const lxM = Object.keys(SSA_2021_LX).map(Number).sort((a, b) => a - b).map((a) => SSA_2021_LX[a].male);
  const lxF = Object.keys(SSA_2021_LX).map(Number).sort((a, b) => a - b).map((a) => SSA_2021_LX[a].female);
  record(LB, 'mortality table: radix 100,000, non-increasing, 120 ages', [lxM, lxF].every((l) => l.length === 120 && l[0] === 100000 && l.every((x, i) => i === 0 || x <= l[i - 1])), {});
  // Provenance cannot be established offline: reported as BLOCKED (never a silent pass) until the table is replaced by
  // the published SSA column and MORTALITY_TABLE_META.verified is set — then it is an ordinary pass/fail check.
  if (MORTALITY_TABLE_META.verified === true) record(LB, 'mortality table: verified against the published SSA source', true, {});
  else blocked.push({ layer: LB, name: 'mortality table: verified against the published SSA source', reason: 'MORTALITY_TABLE_META.verified is false; www.ssa.gov is not reachable from the eval environment (network policy), so the l_x column cannot be compared with the published table. Probability-weighted results depend on it; the assumed-death-year mode does not.' });
  const q65 = deathDistribution({ lx: lxM, age: 65 });
  record(LB, 'mortality: male 65 life expectancy plausible (SSA 2021 period ≈ 16.8–17.5 yrs incl. ½-year)', (() => { const e = q65.q.reduce((a, p, i) => a + p * (i + 0.5), 0); return e > 15.5 && e < 18.5; })(), { eMale65: q65.q.reduce((a, p, i) => a + p * (i + 0.5), 0) });

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
    label: LABEL, seed: SEED, sweep: N_SWEEP, personas: PERSONAS.length, handCases: HAND_CASES.length,
    scenariosEvaluated: valid.length, scenariosRejected: rejected.length, scenariosWithAnyFailure: valid.filter((v) => v.failed).length,
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
