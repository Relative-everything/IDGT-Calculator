// Married couples: the estate-tax event is the second death (docs/changes/2026-09-27-life-tables/model.md).
// Pure functions, no React; decimals in, numbers out; money is never rounded.
//
// Every pair of death years (i for the grantor, j for the spouse) is valued explicitly:
//   case B, spouse first (j < i): the spouse's estate passes to the grantor under the marital deduction (§2056) and the
//     spouse's unused exclusion ports to the grantor (DSUE, §2010(c)(4)); the grantor's own death is then the v1 ledger
//     (simulate) with the exclusion raised by that DSUE.
//   case A, grantor first (i ≤ j, same year = grantor first, J-3): at the grantor's death everything passes to the spouse
//     (§2056), only the §2035(b) gift-tax add-back is taxable (interrelated with the marital deduction, §2056(b)(4)(A)),
//     the grantor's DSUE ports to the spouse, the grantor's included assets are stepped up (§1014), the IDGT becomes a
//     non-grantor trust paying its own tax and the swap power ends (§§671–677, §672(e)); the spouse's estate is taxed at j.
// NPV(s) = Σ_{i,j} q^G_i q^S_j v^{max(i,j)} ΔH_ij(s). Rows are expectations given the year of the second death, so the
// v1 identities (NPV = Σ_t q_t DF_t ΔH_t; components sum to NPV) hold on them unchanged.

import { simulate, aggregate, resolveSwapProfile } from './idgtModel.js';
import { simulateIng } from './ingModel.js';
import { deriveGift, makeBases, exclusionAt } from './fedTax.js';
import { deathProbabilities, expectedDeathYear, secondDeathDistribution } from './mortality.js';
import { SECTION_2035_WINDOW_YEARS, SWAP_TIE_TOLERANCE } from './constants.js';

// Floor at zero: a tax base, an exclusion amount or a DSUE cannot be negative (§2010(c)(4); Reg. §20.2010-2(c)).
const pos = (x) => Math.max(0, x);

/**
 * Row keys aggregated as expectations given the year of the second death (model §4). Each pair's values are written into
 * a reusable Float64Array at these indices (I.* / N.*) and accumulated by index: the pair loops run O(N³) times, and
 * string-keyed updates were 60% of the run time.
 */
const IDGT_ROW_KEYS = Object.freeze([
  'V', 'Vs', 'Bb', 'Bs', 'Eb', 'Es', 'W', 'WB', 'T', 'TB', 'Tself', 'incl', 'inclS', 'TEb', 'TEs', 'baseB', 'baseS',
  'ETb', 'ETs', 'SUb', 'SUs', 'Hb', 'Hs', 'BIG', 'add2035', 'ET1', 'dsueHold', 'dsueGift', 'swapped', 'grantorFirst', 'Xt',
  'dH', 'dTW', 'dTWgt', 'dTWsw', 'dET', 'dSU', 'freeze', 'burnC', 'giftTaxC', 'resid', 'stepUp',
]);
const ING_ROW_KEYS = Object.freeze([
  'Vn', 'Bn', 'En', 'Vsame', 'Vrate', 'inclN', 'TEn', 'baseN', 'ETn', 'SUn', 'Hn', 'V', 'Eb', 'ETb', 'SUb', 'Hb',
  'grantorFirst', 'Xt', 'dsue', 'dH', 'dTW', 'dET', 'dSU', 'loc', 'ss', 'fee', 'locNet', 'ssNet', 'feeNet', 'stepUp',
]);
const indexOf = (keys) => Object.freeze(Object.fromEntries(keys.map((k, i) => [k, i])));
const I = indexOf(IDGT_ROW_KEYS);
const N = indexOf(ING_ROW_KEYS);

/** Death-year distributions of both lives and of the second death (model §2). */
export function marriedLives(inp) {
  const G = deathProbabilities({ lx: inp.lx, age: inp.age, deathYearOverride: inp.deathYearOverride ?? null });
  const deterministic = inp.deathYearOverride != null; // both lives deterministic, or both from the table
  const Sp = deathProbabilities({ lx: inp.lxSpouse, age: inp.ageSpouse, deathYearOverride: deterministic ? inp.deathYearOverrideSpouse : null });
  const qL = secondDeathDistribution(G.q, Sp.q);
  return {
    qG: G.q, qS: Sp.q, NG: G.N, NS: Sp.N, qL, NL: qL.length, deterministic,
    tG: deterministic ? inp.deathYearOverride : null, tS: deterministic ? inp.deathYearOverrideSpouse : null,
    warnings: [...new Set([...G.warnings, ...Sp.warnings])],
  };
}

/** Everything the pair ledger needs that does not depend on the swap year. */
function context(inp, lives) {
  const {
    FMV, B0, g, y, S = 0, delta = 0, annualExclusions = 0, tauOrd, tauCg, tauBene, tauE, d, rE, pi, X0, P = 0, k = 1,
    discountAtDeath = false, saleAppliesToBaseline = true,
  } = inp;
  const XP = inp.XP ?? X0;
  const gift = deriveGift({ FMV, delta, annualExclusions, B0, X0, P, XP, tauE });
  const usedPrior = Math.min(P, XP);
  const PS = inp.PS ?? 0;
  const XPS = inp.XPS ?? X0;
  const usedPriorS = Math.min(PS, XPS); // spouse's prior gifts sheltered by the exclusion of their year (§2001(g)(2))
  const portability = inp.portability ?? true;
  const v = 1 / (1 + d);
  const NL = lives.NL;
  const vPow = new Array(NL + 1);
  const Xs = new Array(NL + 1); // X_t by year, precomputed (v1 §2): the pair loops read it O(N³) times
  for (let t = 0; t <= NL; t += 1) { vPow[t] = Math.pow(v, t); Xs[t] = exclusionAt({ X0, pi }, t); }
  const X = (t) => Xs[t];
  // Spouse dies first in year j: estate to the grantor (marital deduction, taxable estate 0) — Reg. §20.2010-2(c)(1):
  // DSUE = min(BEA_j, AEA_j − (0 + ATG^{DSUE})), ATG^{DSUE} = gifts sheltered by exclusion (Reg. §20.2010-2(c)(2)).
  const dsueSpouse = new Array(lives.NS + 1).fill(0);
  if (portability) for (let j = 1; j <= lives.NS; j += 1) dsueSpouse[j] = pos(Math.min(X(j), Math.max(X(j), usedPriorS) - usedPriorS));
  return {
    inp, lives, gift, bases: makeBases({ X0, pi, P, XP, Ug: gift.Ug, R: gift.R, Uc: gift.Uc }),
    usedPrior, usedPriorS, portability, X, Xs, vPow, vk: Math.pow(v, k), dsueSpouse,
    f: discountAtDeath ? 1 - delta : 1, tauOrd, tauCg, tauBene, tauE, rE, S, saleAppliesToBaseline,
    g, y, gr: inp.gr ?? g, yr: inp.yr ?? y, swap: resolveSwapProfile(inp),
  };
}

// Asset growth and yield in year u: post-sale rates after a scheduled sale (v1 §4).
const growthAt = (c, u) => (c.S > 0 && u > c.S ? c.gr : c.g);
const yieldAt = (c, u) => (c.S > 0 && u > c.S ? c.yr : c.y);

/** The grantor dies first in year i: DSUE of the keep world (and of the ING world — no gifts, all to the spouse). */
function dsueHoldFirst(c, i) {
  if (!c.portability) return 0;
  const Xi = c.X(i);
  return pos(Math.min(Xi, Math.max(Xi, c.usedPrior) - c.usedPrior));
}

/**
 * The grantor dies first in year i, gift world: §2035(b) add-back, first-death estate tax on it (paid from the marital
 * share, so tax-inclusive: ET₁ = τ_e b/(1 − τ_e) for b > 0, §2056(b)(4)(A)) and the grantor's DSUE (Reg. §20.2010-2(c)).
 */
function giftFirstDeath(c, i) {
  const { G, Uc } = c.gift;
  const add = i <= SECTION_2035_WINDOW_YEARS ? G : 0;
  const b = c.bases.baseGift(add, i); // TE = add-back only; the rest passes under the marital deduction
  const ET1 = b > 0 ? c.tauE * b / (1 - c.tauE) : 0;
  const Xi = c.X(i);
  const dsue = c.portability ? pos(Math.min(Xi, Math.max(Xi, c.usedPrior + Uc) - (add + ET1 + c.usedPrior + Uc))) : 0;
  return { add, ET1, dsue };
}

/** The spouse's §2001(b) base at the spouse's death in year j (no gifts beyond PS; AEA = BEA + DSUE, §2010(c)(2)). */
const spouseBase = (c, TE, j, dsue) => TE + c.usedPriorS - (Math.max(c.Xs[j], c.usedPriorS) + dsue);

/**
 * Keep world, grantor first in year i: the asset passes to the spouse stepped up, then earns and is taxed to the spouse from E.
 * Returns, for every j = i..N_S, the keep-world valuation at the spouse's death.
 */
function holdContinuation(c, row, i) {
  const { f, tauE, tauBene, tauOrd, tauCg, vk, rE } = c;
  const NS = c.lives.NS;
  const dsue = dsueHoldFirst(c, i);
  let E = row.Eb;
  let V = row.V;
  let B = V * f; // §1014 step-up to the included value at the grantor's death
  const out = new Array(Math.max(0, NS - i + 1));
  for (let j = i; j <= NS; j += 1) {
    if (j > i) {
      const gt = growthAt(c, j);
      const yt = yieldAt(c, j);
      const Y = yt * V;
      V = V * (1 + gt) + Y;
      B += Y;
      E = E * (1 + rE) - tauOrd * Y;
      if (c.S > 0 && j === c.S && c.saleAppliesToBaseline) { E -= tauCg * pos(V - B); B = V; }
    }
    const incl = V * f;
    const TE = E + incl;
    const base = spouseBase(c, TE, j, dsue);
    const ET = tauE * pos(base);
    const SU = tauBene * (V - incl) * vk; // stepped up again at the spouse's death, to the included value
    out[j - i] = { E, V, B, incl, TE, base, ET, SU, H: E + V - ET - SU, dsue };
  }
  return out;
}

/** v1 Level B chain on a pair's deciding bases (model §4), written into the record; exact by telescoping. */
function writeLevelB(c, out, b0, b4, Tself, T, swapped, dTWgt, dTWsw, add, dSU) {
  const { tauE, f } = c;
  const { Ug, G } = c.gift;
  const fSw = swapped ? f : 1;
  const b1 = b0 - (Tself - Ug);
  const b2 = b1 - (T - fSw * Tself);
  const b3 = b2 - G / tauE + dTWgt + add;
  out[I.freeze] = tauE * (pos(b0) - pos(b1));
  out[I.burnC] = tauE * (pos(b1) - pos(b2));
  out[I.giftTaxC] = tauE * (pos(b2) - pos(b3)) + dTWgt;
  out[I.resid] = tauE * (pos(b3) - pos(b4)) + dTWsw;
  out[I.stepUp] = dSU;
}

/**
 * Case B — spouse first (j < i): the v1 row at the grantor's death with the exclusion raised by the spouse's DSUE.
 * Returns ΔH; with `out` it also writes the full record.
 */
function pairSpouseFirst(c, r, j, out) {
  const D = c.dsueSpouse[j];
  const baseB = r.baseB - D;
  const baseS = r.baseS - D;
  const ETb = c.tauE * pos(baseB);
  const ETs = c.tauE * pos(baseS);
  const dH = r.dTW + (ETb - ETs) + r.dSU;
  if (!out) return dH;
  out[I.V] = r.V; out[I.Vs] = r.Vs; out[I.Bb] = r.Bb; out[I.Bs] = r.Bs; out[I.Eb] = r.Eb; out[I.Es] = r.Es;
  out[I.W] = r.W; out[I.WB] = r.WB; out[I.T] = r.T; out[I.TB] = r.TB; out[I.Tself] = r.Tself;
  out[I.incl] = r.incl; out[I.inclS] = r.inclS; out[I.TEb] = r.TEb; out[I.TEs] = r.TEs; out[I.baseB] = baseB; out[I.baseS] = baseS;
  out[I.ETb] = ETb; out[I.ETs] = ETs; out[I.SUb] = r.SUb; out[I.SUs] = r.SUs;
  out[I.Hb] = r.Eb + r.V - ETb - r.SUb; out[I.Hs] = r.Es + (r.swapped ? r.Vs : 0) + r.T - ETs - r.SUs;
  out[I.BIG] = r.BIG; out[I.add2035] = r.add2035; out[I.ET1] = 0; out[I.dsueHold] = D; out[I.dsueGift] = D;
  out[I.swapped] = r.swapped ? 1 : 0; out[I.grantorFirst] = 0; out[I.Xt] = r.Xt;
  out[I.dH] = dH; out[I.dTW] = r.dTW; out[I.dTWgt] = r.dTWgt; out[I.dTWsw] = r.dTWsw; out[I.dET] = ETb - ETs; out[I.dSU] = r.dSU;
  writeLevelB(c, out, baseB, baseS, r.Tself, r.T, r.swapped, r.dTWgt, r.dTWsw, r.add2035, r.dSU);
  return dH;
}

/**
 * Case A — grantor first in year i, gift world: first-death events, then the non-grantor trust and the spouse's holdings
 * through each possible spouse death year j = i..N_S. `visit(j, dH)` is called for every j; with `out` the full record
 * for that j is in `out` during the call.
 */
function giftContinuation(c, r, i, hold, out, visit) {
  const { f, tauE, tauBene, tauOrd, tauCg, vk, rE } = c;
  const { ySw, gSw, tauSw } = c.swap;
  const G = c.gift.G;
  const NS = c.lives.NS;
  const first = giftFirstDeath(c, i);
  const swapped = r.swapped;
  let E = r.Es - first.ET1;
  let Vs = r.Vs;
  let Bs = swapped ? Vs * f : r.Bs; // a swapped-back asset is the grantor's: stepped up at the grantor's death
  let W = r.W;
  let WB = r.WB;
  let Tself = r.Tself;
  let Bself = r.Bself;
  for (let j = i; j <= NS; j += 1) {
    if (j > i) {
      const gt = growthAt(c, j);
      const yt = yieldAt(c, j);
      let burnE = 0;
      if (swapped) {
        const Y = yt * Vs; // the spouse owns the swapped-back asset and pays its tax from E
        Vs = Vs * (1 + gt) + Y;
        Bs += Y;
        burnE = tauOrd * Y;
        const YW = ySw * W; // the trust pays its own tax on the consideration (non-grantor, M-6)
        const netW = (1 - tauSw) * YW;
        W = W * (1 + gSw) + netW;
        WB += netW;
        Tself *= 1 + gSw + (1 - tauSw) * ySw;
      } else {
        const net = yt * (1 - tauOrd) * Vs; // non-grantor trust: tax paid from the trust (same form as T^self)
        Bs += net;
        Vs = Vs * (1 + gt) + net;
        const yAfterTax = yt * (1 - tauOrd) * Tself;
        Bself += yAfterTax;
        Tself = Tself * (1 + gt) + yAfterTax;
      }
      E = E * (1 + rE) - burnE;
      if (c.S > 0 && j === c.S) {
        const CG = tauCg * pos(Vs - Bs);
        if (swapped) E -= CG; // the spouse sells
        else {
          Vs -= CG; // the trust sells and pays its own gain tax
          const cgSelf = tauCg * pos(Tself - Bself);
          Tself -= cgSelf;
          Bself = Tself;
        }
        Bs = Vs;
      }
    }
    const h = hold[j - i];
    const T = swapped ? W : Vs;
    const TB = swapped ? WB : Bs;
    const inclS = Vs * f;
    const TEs = E + (swapped ? inclS : 0);
    const baseS = spouseBase(c, TEs, j, first.dsue);
    const ETs = tauE * pos(baseS);
    const BIG = pos(T - TB);
    const SUs = tauBene * BIG * vk + (swapped ? tauBene * (Vs - inclS) * vk : 0);
    const Hs = E + (swapped ? Vs : 0) + T - ETs - SUs;
    const dH = Hs - h.H;
    if (out) {
      const dTW = (E + (swapped ? Vs : 0) + T) - (h.E + h.V);
      const dTWgt = -G * Math.pow(1 + rE, j);
      const dTWsw = dTW - dTWgt;
      const dSU = h.SU - SUs;
      out[I.V] = h.V; out[I.Vs] = Vs; out[I.Bb] = h.B; out[I.Bs] = Bs; out[I.Eb] = h.E; out[I.Es] = E;
      out[I.W] = W; out[I.WB] = WB; out[I.T] = T; out[I.TB] = TB; out[I.Tself] = Tself;
      out[I.incl] = h.incl; out[I.inclS] = inclS; out[I.TEb] = h.TE; out[I.TEs] = TEs; out[I.baseB] = h.base; out[I.baseS] = baseS;
      out[I.ETb] = h.ET; out[I.ETs] = ETs; out[I.SUb] = h.SU; out[I.SUs] = SUs; out[I.Hb] = h.H; out[I.Hs] = Hs;
      out[I.BIG] = BIG; out[I.add2035] = first.add; out[I.ET1] = first.ET1; out[I.dsueHold] = h.dsue; out[I.dsueGift] = first.dsue;
      out[I.swapped] = swapped ? 1 : 0; out[I.grantorFirst] = 1; out[I.Xt] = c.Xs[j];
      out[I.dH] = dH; out[I.dTW] = dTW; out[I.dTWgt] = dTWgt; out[I.dTWsw] = dTWsw; out[I.dET] = h.ET - ETs; out[I.dSU] = dSU;
      writeLevelB(c, out, h.base, baseS, Tself, T, swapped, dTWgt, dTWsw, first.add, dSU);
    }
    visit(j, dH);
  }
}

/** Pairs that carry weight, and the pair shown on each row in deterministic mode (model §2). */
function displayPair(lives, t) {
  const i = Math.min(lives.tG, t);
  const j = Math.min(lives.tS, t);
  return [i, j];
}

/**
 * Σ_j q^S_j v^{max(i,j)} ΔH_ij for one grantor death year i (the NPV contribution before the q^G_i weight).
 */
function contributionForGrantorYear(c, rows, holdA, i) {
  const { qS, NS } = c.lives;
  const r = rows[i - 1];
  let sum = 0;
  const vi = c.vPow[i];
  for (let j = 1; j <= Math.min(i - 1, NS); j += 1) {
    const w = qS[j - 1];
    if (w !== 0) sum += w * vi * pairSpouseFirst(c, r, j, null);
  }
  if (i <= NS) giftContinuation(c, r, i, holdA[i], null, (j, dH) => { const w = qS[j - 1]; if (w !== 0) sum += w * c.vPow[j] * dH; });
  return sum;
}

/**
 * Aggregate pair records into rows by the year of the second death (conditional expectations, model §4).
 * `pairRecords(i, j, out, emit)` writes the record of pair (i, j) into `out` and calls emit(t) — or, with j = null, every
 * pair (i, j ≥ i) of case A in turn, calling emit(j) after each.
 */
function aggregateRows(c, keys, pairRecords) {
  const { qG, qS, qL, NL, NG, NS, deterministic } = c.lives;
  const K = keys.length;
  const acc = new Float64Array(NL * K);
  const out = new Float64Array(K);
  let weight = 0;
  const add = (t) => { const base = (t - 1) * K; for (let k = 0; k < K; k += 1) acc[base + k] += weight * out[k]; };
  if (deterministic) {
    weight = 1;
    for (let t = 1; t <= NL; t += 1) {
      const [i, j] = displayPair(c.lives, t);
      pairRecords(i, j, out, () => add(t));
    }
  } else {
    for (let i = 1; i <= NG; i += 1) {
      const wi = qG[i - 1];
      if (wi === 0) continue;
      for (let j = 1; j <= Math.min(i - 1, NS); j += 1) {
        weight = wi * qS[j - 1];
        if (weight !== 0) pairRecords(i, j, out, () => add(i));
      }
      if (i <= NS) pairRecords(i, null, out, (j) => { weight = wi * qS[j - 1]; if (weight !== 0) add(j); });
    }
  }
  const age = c.inp.age;
  const ageS = c.inp.ageSpouse;
  const rows = new Array(NL);
  for (let t = 1; t <= NL; t += 1) {
    const q = deterministic ? (t === NL ? 1 : 0) : qL[t - 1];
    const base = (t - 1) * K;
    const row = { t, age: age + t, ageSpouse: ageS + t };
    if (deterministic || q > 0) {
      const norm = deterministic ? 1 : 1 / q;
      for (let k = 0; k < K; k += 1) row[keys[k]] = acc[base + k] * norm;
    } else {
      // no probability of a second death this year (display only): show both deaths at the end of year t
      pairRecords(Math.min(t, NG), Math.min(t, NS), out, () => {});
      for (let k = 0; k < K; k += 1) row[keys[k]] = out[k];
    }
    const DF = c.vPow[t];
    row.DF = DF;
    row.PV = row.dH * DF;
    row.q = q;
    row.wPV = q * row.PV;
    rows[t - 1] = row;
  }
  return rows;
}

/** Keep-world continuations for every grantor-first year (independent of the swap year). */
function holdTable(c, noneRows) {
  const holdA = new Array(c.lives.NG + 1);
  for (let i = 1; i <= Math.min(c.lives.NG, c.lives.NS); i += 1) holdA[i] = holdContinuation(c, noneRows[i - 1], i);
  return holdA;
}

/**
 * Full evaluation of one asset for a married couple (model §4). Called by evaluateAsset (idgtModel.js) after
 * validation; same result shape as the single-life evaluation plus `lives`.
 */
export function evaluateMarried(inp, warnings) {
  const lives = marriedLives(inp);
  const c = context(inp, lives);
  const { NG, qG } = lives;
  const allWarnings = [...warnings];
  lives.warnings.forEach((code) => allWarnings.push({ code, data: {} }));

  const none = simulate(inp, 0, NG);
  const holdA = holdTable(c, none.rows);
  const Cnone = new Array(NG + 1).fill(0);
  for (let i = 1; i <= NG; i += 1) if (qG[i - 1] !== 0) Cnone[i] = qG[i - 1] * contributionForGrantorYear(c, none.rows, holdA, i);
  const sumC = (C, from, to) => { let s = 0; for (let i = from; i <= to; i += 1) s += C[i]; return s; };
  const npvNone = sumC(Cnone, 1, NG);
  const curve = [{ s: 0, npv: npvNone, feasible: true, reason: null }];
  const sims = new Map([[0, none]]);
  let npvPF = 0;
  for (let s = 1; s <= NG; s += 1) {
    const sim = simulate(inp, s, NG);
    if (sim.infeasible) {
      curve.push({ s, npv: null, feasible: false, reason: sim.infeasible });
      npvPF += Cnone[s];
      continue;
    }
    let npv = sumC(Cnone, 1, s - 1); // the grantor dies before the swap: identical to no swap
    for (let i = s; i <= NG; i += 1) {
      if (qG[i - 1] === 0) continue;
      const Ci = qG[i - 1] * contributionForGrantorYear(c, sim.rows, holdA, i);
      if (i === s) npvPF += Ci; // deathbed swap: the grantor swaps in the year of the grantor's own death
      npv += Ci;
    }
    curve.push({ s, npv, feasible: true, reason: null });
    sims.set(s, sim);
  }
  const tol = (ref) => SWAP_TIE_TOLERANCE * Math.max(1, Math.abs(ref));
  const maxNpv = Math.max(...curve.filter((x) => x.feasible).map((x) => x.npv));
  const pick = curve.find((x) => x.feasible && x.npv >= maxNpv - tol(maxNpv));

  const rowsFor = (sim) => aggregateRows(c, IDGT_ROW_KEYS, (i, j, out, emit) => {
    const r = sim.rows[i - 1];
    if (j != null && j < i) { pairSpouseFirst(c, r, j, out); emit(i); } else if (j != null) {
      giftContinuation(c, r, i, holdA[i] ?? holdContinuation(c, none.rows[i - 1], i), out, (jj) => { if (jj === j) emit(j); });
    } else giftContinuation(c, r, i, holdA[i], out, (jj) => emit(jj));
  });
  const rowsNone = rowsFor(none);
  const rowsOpt = pick.s === 0 ? rowsNone : rowsFor(sims.get(pick.s));
  const q = rowsNone.map((r) => r.q);
  const aggNone = aggregate(rowsNone, q);
  const aggOpt = pick.s === 0 ? aggNone : aggregate(rowsOpt, q);

  const { Ug, G } = none.derived;
  const eff = (npv) => (Ug > 0 ? npv / Ug : null);
  const effGT = (npv) => (G > 0 ? npv / G : null);
  if (!(Ug > 0)) allWarnings.push({ code: 'ZERO_TAXABLE_GIFT', data: {} });
  if (inp.S > lives.NL) allWarnings.push({ code: 'SALE_BEYOND_HORIZON', data: { S: inp.S, N: lives.NL } });
  if (G > 0) {
    const taxed = [];
    for (let i = 1; i <= Math.min(SECTION_2035_WINDOW_YEARS, NG); i += 1) {
      // the grantor can die FIRST in year i only if the spouse can still be alive then: P(T_S ≥ i) > 0
      const spouseAlive = lives.qS.slice(i - 1).reduce((a, b) => a + b, 0);
      if (qG[i - 1] > 0 && spouseAlive > 0 && giftFirstDeath(c, i).ET1 > 0) taxed.push(i);
    }
    if (taxed.length) allWarnings.push({ code: 'FIRST_DEATH_TAX', data: { years: taxed, amount: giftFirstDeath(c, taxed[0]).ET1 } });
  }
  // Liquidity is the grantor's while the grantor pays the burn: first year the other estate turns negative on that path.
  const firstNegative = (rows) => rows.find((r) => r.Es < 0);
  const bestSim = sims.get(pick.s);
  const negNone = firstNegative(none.rows);
  const negOpt = pick.s > 0 ? firstNegative(bestSim.rows) : null;
  const neg = negNone && negOpt ? (negOpt.t <= negNone.t ? negOpt : negNone) : (negNone ?? negOpt);
  if (neg) {
    const survival = qG.slice(neg.t - 1).reduce((a, b) => a + b, 0);
    const inSwapScenario = neg === negOpt && negOpt !== negNone;
    allWarnings.push({ code: 'GRANTOR_ILLIQUID', data: { year: neg.t, age: inp.age + neg.t, survival, swapYear: inSwapScenario ? pick.s : 0, giftTaxPaid: G > 0 } });
  }

  let shareBeyondDisplay = null;
  if (Number.isInteger(inp.NDisp) && inp.NDisp > 0) {
    const total = rowsOpt.reduce((a, r) => a + Math.abs(r.wPV), 0);
    const beyond = rowsOpt.filter((r) => r.t > inp.NDisp).reduce((a, r) => a + Math.abs(r.wPV), 0);
    shareBeyondDisplay = total > 0 ? beyond / total : 0;
  }
  const expectedGrantorDeathYear = expectedDeathYear(qG);
  const expectedSecondDeathYear = lives.deterministic ? lives.NL : expectedDeathYear(lives.qL);
  return {
    derived: {
      ...none.derived, N: lives.NL, NG, NS: lives.NS, omega: null, married: true, portability: c.portability,
      expectedDeathYear: expectedSecondDeathYear, expectedGrantorDeathYear, expectedSecondDeathYear,
      expectedSpouseDeathYear: expectedDeathYear(lives.qS),
    },
    q,
    lives: { married: true, qG, qS: lives.qS, qL: lives.qL, NG, NS: lives.NS, deterministic: lives.deterministic },
    rows: { none: rowsNone, opt: rowsOpt },
    npvCurve: curve,
    npvNone,
    npvOpt: pick.npv,
    sStar: pick.s,
    npvPF,
    eff: { none: eff(npvNone), opt: eff(pick.npv) },
    effPerGiftTax: { none: effGT(npvNone), opt: effGT(pick.npv) },
    effPerFMV: { none: npvNone / inp.FMV, opt: pick.npv / inp.FMV },
    components: { none: aggNone.components, opt: aggOpt.components },
    shareBeyondDisplay,
    warnings: allWarnings,
  };
}

/**
 * The ING for a married couple (model §3, M-9): case B — the v1/ING row at the grantor's death with the spouse's DSUE;
 * case A — the ING property passes to the spouse at the grantor's death (marital deduction, stepped up) and is then the spouse's
 * exactly like the keep-world asset. Returns rows by the second death, the NPV and the four components.
 */
export function evaluateIngMarried(inp) {
  const lives = marriedLives(inp);
  const c = context(inp, lives);
  const { NG, NS } = lives;
  const none = simulate(inp, 0, NG);
  const holdA = holdTable(c, none.rows);
  const ingSingle = simulateIng(inp, NG);
  const ingRows = ingSingle.rows;
  const { f, tauE, tauBene, tauOrd, tauCg, vk, rE } = c;

  // ING model.md §4 attribution, written into the record: c0 … c3 are the deciding estate's bases (affine in TE).
  const writeComponents = (out, loc, ss, fee, c0, c1, c2, c3, dSU) => {
    out[N.loc] = loc; out[N.ss] = ss; out[N.fee] = fee;
    out[N.locNet] = loc - tauE * (pos(c1) - pos(c0));
    out[N.ssNet] = ss - tauE * (pos(c2) - pos(c1));
    out[N.feeNet] = fee - tauE * (pos(c3) - pos(c2));
    out[N.stepUp] = dSU;
  };
  // case B: the grantor dies second — the grantor's v1/ING row with every base shifted by the spouse's DSUE
  const caseB = (i, j, out) => {
    const r = ingRows[i - 1];
    const D = c.dsueSpouse[j];
    const c0 = none.rows[i - 1].baseB - D;
    const c1 = c0 + (r.En - r.Eb) + (r.Vsame - r.V) * f;
    const c2 = c1 + r.ss * f;
    const c3 = r.baseN - D;
    const ETn = tauE * pos(c3);
    const ETb = tauE * pos(c0);
    const Hn = r.En + r.Vn - ETn - r.SUn;
    const Hb = r.Eb + r.V - ETb - r.SUb;
    out[N.Vn] = r.Vn; out[N.Bn] = r.Bn; out[N.En] = r.En; out[N.Vsame] = r.Vsame; out[N.Vrate] = r.Vrate;
    out[N.inclN] = r.inclN; out[N.TEn] = r.TEn; out[N.baseN] = c3; out[N.ETn] = ETn; out[N.SUn] = r.SUn; out[N.Hn] = Hn;
    out[N.V] = r.V; out[N.Eb] = r.Eb; out[N.ETb] = ETb; out[N.SUb] = r.SUb; out[N.Hb] = Hb; out[N.grantorFirst] = 0; out[N.Xt] = r.Xt; out[N.dsue] = D;
    out[N.dH] = Hn - Hb; out[N.dTW] = r.dTW; out[N.dET] = ETb - ETn; out[N.dSU] = r.dSU;
    writeComponents(out, r.loc, r.ss, r.fee, c0, c1, c2, c3, r.dSU);
  };
  // case A: the ING property becomes the spouse's at the grantor's death (step-up), then earns like the keep asset
  const caseA = (i, out, visit) => {
    const r = ingRows[i - 1];
    const hold = holdA[i];
    let En = r.En;
    let Vn = r.Vn;
    let Bn = Vn * f;
    let growth = 1; // gross factor since the grantor's death: the three counterfactual paths move with the property
    for (let j = i; j <= NS; j += 1) {
      if (j > i) {
        const gt = growthAt(c, j);
        const yt = yieldAt(c, j);
        const Y = yt * Vn;
        Vn = Vn * (1 + gt) + Y;
        growth *= 1 + gt + yt;
        Bn += Y;
        En = En * (1 + rE) - tauOrd * Y;
        if (c.S > 0 && j === c.S) { En -= tauCg * pos(Vn - Bn); Bn = Vn; }
      }
      const h = hold[j - i];
      const Vsame = r.Vsame * growth;
      const Vrate = r.Vrate * growth;
      const inclN = Vn * f;
      const TEn = En + inclN;
      const baseN = spouseBase(c, TEn, j, h.dsue);
      const ETn = tauE * pos(baseN);
      const SUn = tauBene * (Vn - inclN) * vk;
      const Hn = En + Vn - ETn - SUn;
      const loc = (En - h.E) + (Vsame - h.V);
      const ss = Vrate - Vsame;
      const fee = Vn - Vrate;
      const c0 = h.base;
      const c1 = c0 + (En - h.E) + (Vsame - h.V) * f;
      const c2 = c1 + ss * f;
      out[N.Vn] = Vn; out[N.Bn] = Bn; out[N.En] = En; out[N.Vsame] = Vsame; out[N.Vrate] = Vrate;
      out[N.inclN] = inclN; out[N.TEn] = TEn; out[N.baseN] = baseN; out[N.ETn] = ETn; out[N.SUn] = SUn; out[N.Hn] = Hn;
      out[N.V] = h.V; out[N.Eb] = h.E; out[N.ETb] = h.ET; out[N.SUb] = h.SU; out[N.Hb] = h.H; out[N.grantorFirst] = 1; out[N.Xt] = c.Xs[j]; out[N.dsue] = h.dsue;
      out[N.dH] = Hn - h.H; out[N.dTW] = (En + Vn) - (h.E + h.V); out[N.dET] = h.ET - ETn; out[N.dSU] = h.SU - SUn;
      writeComponents(out, loc, ss, fee, c0, c1, c2, baseN, h.SU - SUn);
      visit(j);
    }
  };
  const rows = aggregateRows(c, ING_ROW_KEYS, (i, j, out, emit) => {
    if (j != null && j < i) { caseB(i, j, out); emit(i); } else if (j != null) caseA(i, out, (jj) => { if (jj === j) emit(j); });
    else caseA(i, out, (jj) => emit(jj));
  }).map((r) => ({ ...r, T: r.Vn, ETs: r.ETn, SUs: r.SUn, Hs: r.Hn })); // ledger aliases, as in simulateIng
  return { rows, derived: { ...ingSingle.derived, NG, NS } };
}
