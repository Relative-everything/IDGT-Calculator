// Engine-vs-reference cross-check for the ING module (plan.md "Proof"). Seeded random scenarios; every row field
// of the IDGT ledger (random burn share, three swap years) and of the ING ledger compared at relative 1e-9.
// Run from the repo root: node docs/changes/2026-09-27-ing-comparison/reference/xcheck.mjs
import { simulate } from '../../../../src/engine/idgtModel.js';
import { simulateIng } from '../../../../src/engine/ingModel.js';
import { validateInputs } from '../../../../src/engine/validate.js';
import { simulateIdgt, simulateIng as refIng } from './ing-ref.mjs';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r = rng(20260927);
const u = (lo, hi) => lo + (hi - lo) * r();
const pick = (arr) => arr[Math.floor(r() * arr.length)];

const IDGT_KEYS = [['V', 'Vb'], ['Vs', 'Vs'], ['Bs', 'Bs'], ['Eb', 'Eb'], ['Es', 'Es'], ['W', 'W'], ['WB', 'WB'], ['Tself', 'Tself'], ['ETb', 'ETb'], ['ETs', 'ETs'],
  ['SUb', 'SUb'], ['SUs', 'SUs'], ['Hb', 'Hb'], ['Hs', 'Hs'], ['dH', 'dH'], ['freeze', 'freeze'], ['burnC', 'burnC'], ['giftTaxC', 'giftTaxC'], ['resid', 'resid'], ['stepUp', 'stepUp'], ['PV', 'PV'],
  ['trustPaid', 'trustPaid'], ['grantorPaid', 'grantorPaid']];
const ING_KEYS = ['Vn', 'Bn', 'En', 'Vsame', 'Vrate', 'ETn', 'SUn', 'Hn', 'dH', 'loc', 'ss', 'fee', 'locNet', 'ssNet', 'feeNet', 'stepUp', 'PV'];

let scenarios = 0; let values = 0; let worst = 0; let worstAt = ''; const mismatches = []; let skipped = 0;
const check = (label, a, b, scale) => {
  values += 1;
  const rel = Math.abs(a - b) / Math.max(1, Math.abs(scale));
  if (rel > worst) { worst = rel; worstAt = label; }
  if (!(rel <= 1e-9)) mismatches.push(`${label}: engine ${a} ref ${b}`);
};

for (let i = 0; i < 400; i += 1) {
  const N = 1 + Math.floor(r() * 40);
  const FMV = u(1e5, 2e7);
  const state = pick([0, 0.03, 0.05, 0.0965, 0.133]);
  const niit = pick([0, 0.038]);
  const S = r() < 0.35 ? 1 + Math.floor(r() * N) : 0;
  const P = r() < 0.3 ? pick([13_990_000, 15_000_000, 20_000_000]) : 0;
  const inp = {
    age: 50, lx: null, deathYearOverride: N,
    FMV, B0: r() < 0.15 ? FMV * u(1, 1.5) : FMV * u(0, 1), g: u(-0.05, 0.12), y: u(0, 0.07), S, gr: u(0, 0.08), yr: u(0, 0.04),
    delta: r() < 0.4 ? u(0, 0.4) : 0, annualExclusions: r() < 0.2 ? 38_000 : 0,
    tauOrd: 0.37 + state + niit, tauCg: 0.2 + state + niit, stateOrd: state, stateCg: state, niit,
    tauBene: pick([0.2, 0.25, 0.288]), tauE: 0.4, d: u(0.02, 0.07), rE: u(0, 0.07), pi: u(0, 0.03),
    X0: 15_000_000, P, XP: P > 0 ? pick([13_990_000, 15_000_000]) : 15_000_000, E0: pick([2e6, 8e6, 14e6, 25e6, 60e6]), k: pick([0, 1, 3]),
    bSw: null, gSw: null, ySw: null, tauSw: null, discountAtDeath: r() < 0.25, saleAppliesToBaseline: r() < 0.7,
    burnShare: pick([0, 1, u(0, 1), u(0, 1)]),
    ingFedOrd: pick([0.37, 0.35]), ingFedLtcg: 0.2, ingStateRate: pick([0, 0, 0.02, 0.05]), ingAdminRate: pick([0, 0, 0.002, 0.008, 0.015]),
    ingStateTaxOnGrantor: r() < 0.2,
  };
  if (r() < 0.2) Object.assign(inp, { gSw: u(0, 0.08), ySw: u(0, 0.05), tauSw: u(0, 0.5), bSw: u(0, 1) });
  if (validateInputs(inp).errors.length) { skipped += 1; continue; }
  scenarios += 1;
  const ref = { ...inp, N };
  for (const s of [0, 1, 1 + Math.floor(r() * N)]) {
    const e = simulate(inp, s, N);
    const q = simulateIdgt(ref, s);
    if (Boolean(e.infeasible) !== Boolean(q.infeasible)) { mismatches.push(`#${i} s=${s} feasibility engine ${e.infeasible} ref ${q.infeasible}`); continue; }
    if (e.infeasible) continue;
    e.rows.forEach((row, t) => { for (const [ek, rk] of IDGT_KEYS) check(`#${i} IDGT s=${s} t=${t + 1} ${ek}`, row[ek], q.rows[t][rk], row.Hb); });
  }
  const en = simulateIng(inp, N).rows;
  const rn = refIng(ref).rows;
  en.forEach((row, t) => { for (const k of ING_KEYS) check(`#${i} ING t=${t + 1} ${k}`, row[k], rn[t][k], row.Hb); });
}
console.log(JSON.stringify({ scenarios, skippedInvalid: skipped, valuesCompared: values, worstRelativeDiff: worst, worstAt, mismatches: mismatches.slice(0, 20), mismatchCount: mismatches.length }, null, 1));
