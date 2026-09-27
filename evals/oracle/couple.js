// CLEAN-ROOM ORACLE — married couples: estate tax at the second death.
//
// Written from the statute (§2056(a), (b)(4)(A) marital deduction; §2010(c)(2)(B), (c)(4) portability and
// Reg. §20.2010-2(c) DSUE; §1014 step-up; §§671–677 / §672(e) grantor-trust status ending at the grantor's death) and
// the plain-English conventions of docs/changes/2026-09-27-life-tables/model.md (M-1…M-10), not from src/engine.
// Each pair of death years (i for the grantor, j for the spouse) is PLAYED OUT on the same lots as the single-life
// oracle (./worlds.js): the grantor-alive path, then — if the grantor dies first — the lots change hands at the
// grantor's death and the survivor's years run to the spouse's death; if the spouse dies first, the spouse's DSUE is
// carried to the grantor's death. Every tax comes from ./statute.js the long way: the first-death tax by fixed-point
// iteration on the interrelated marital deduction (the engine uses a closed form), the DSUE from the gift sequence
// (the engine uses algebra), the second-death tax from the §2001(c) schedule with the ported exclusion.

import { estateTax, dsueLeft, firstDeathWithMaritalDeduction } from './statute.js';
import { resolve, giftFacts, assetRates, earn, sell } from './worlds.js';
import { deathDistribution, secondDeathByPairs } from './lives.js';

const pos = (x) => Math.max(0, x);
const clone = (state) => ({ E: state.E, infeasible: state.infeasible, lots: state.lots.map((l) => ({ ...l })) });
const X = (r, t) => r.X0 * (1 + r.pi) ** (t - 1); // BEA of year t (2026 statutory, indexed after; C-7)
const inclusionFactor = (r) => (r.discountAtDeath ? 1 - r.delta : 1);
const TIE = 1e-6; // documented tie rule: within 1e-6·max(1,|NPV|) prefer no swap, then the earlier year

/** One year of every lot's income and the scheduled sale; mutates `state`. */
function runYear(r, state, t, world) {
  const { g, y } = assetRates(r, t);
  let fromE = 0;
  for (const lot of state.lots) fromE += earn(lot, lot.isAsset ? g : r.gSw, lot.isAsset ? y : r.ySw, r).fromE;
  state.E = state.E * (1 + r.rE) - fromE;
  // the keep world sells only when the plan applies to it; M-7: the survivor keeps the grantor's sale plan
  if (r.S > 0 && t === r.S && (world !== 'hold' || r.saleAppliesToBaseline)) state.E -= sell(state.lots[0], r);
}

/** Grantor-alive path of one world: snapshot at the end of every year t = 1..NG (after the sale and any swap). */
function grantorAlivePath(r, facts, world, s, NG) {
  const owner = world === 'hold' ? 'grantor' : world === 'gift' ? 'idgt' : 'ing';
  const state = {
    E: world === 'gift' ? r.E0 - facts.G : r.E0, // C-5: the donor pays the gift tax at t = 0
    infeasible: null,
    lots: [{ owner, value: r.FMV, basis: world === 'gift' ? facts.BT0 : r.B0, tax: world === 'ing' ? r.ingOrd : r.tauOrd, isAsset: true }],
  };
  const snaps = [null];
  let liquidated = false;
  for (let t = 1; t <= NG; t += 1) {
    const { g, y } = assetRates(r, t);
    let fromE = 0;
    for (const lot of state.lots) {
      const res = earn(lot, lot.isAsset ? g : r.gSw, lot.isAsset ? y : r.ySw, r);
      fromE += res.fromE;
      if (res.liquidated) liquidated = true;
    }
    state.E = state.E * (1 + r.rE) - fromE;
    if (r.S > 0 && t === r.S && (world !== 'hold' || r.saleAppliesToBaseline)) state.E -= sell(state.lots[0], r);
    if (world === 'gift' && s === t) {
      const asset = state.lots[0];
      const price = asset.value * inclusionFactor(r); // §675(4)(C): property of equivalent value
      if (r.S > 0 && t >= r.S) state.infeasible = 'post-sale';
      else if (state.E < price) state.infeasible = 'liquidity';
      else {
        state.E -= price;
        asset.owner = 'grantor'; // Rev. Rul. 85-13: no gain; the grantor takes the trust's basis
        state.lots.push({ owner: 'idgt', value: price, basis: r.bSw * price, tax: r.tauSw, isAsset: false });
      }
    }
    snaps.push(clone(state));
  }
  return { snaps, infeasible: state.infeasible, liquidated };
}

/** Heir wealth with the estate of the decedent who owns `owners` lots taxed now (their lots stepped up, §1014). */
function valueEstate(r, state, t, owners, lifetimeGifts, dsue, extra = 0) {
  const f = inclusionFactor(r);
  const incl = (l) => (l.isAsset ? l.value * f : l.value);
  const inEstate = state.lots.filter((l) => owners.includes(l.owner));
  const outside = state.lots.filter((l) => !owners.includes(l.owner));
  const grossEstate = state.E + inEstate.reduce((a, l) => a + incl(l), 0) + extra;
  const ET = estateTax({ grossEstate, lifetimeGifts, beaAtDeath: X(r, t), topRate: r.tauE, dsue });
  const vk = (1 + r.d) ** -r.k; // heirs sell k years after the (second) death (C-8)
  const CGT = (inEstate.reduce((a, l) => a + r.tauBene * pos(l.value - incl(l)), 0)
    + outside.reduce((a, l) => a + r.tauBene * pos(l.value - l.basis), 0)) * vk;
  const wealth = state.E + state.lots.reduce((a, l) => a + l.value, 0);
  const trustLot = state.lots.find((l) => l.owner === 'idgt' || l.owner === 'trust') ?? null;
  return { H: wealth - ET - CGT, E: state.E, V: state.lots[0].value, T: trustLot ? trustLot.value : 0, TE: grossEstate, ET, SU: CGT };
}

/**
 * Every pair (i, j) with the grantor dying at the end of year i, for one world, from the grantor-alive snapshot at i.
 * Case B (j < i): the spouse's estate passed to the grantor tax-free (§2056) and its unused exclusion ported (DSUE); the
 * grantor's estate is taxed at i. Case A (j ≥ i, same year = grantor first, J-3): the grantor's estate passes to the
 * spouse; the lots change hands; the survivor's years run to j. Returns an array indexed by j (1..NS).
 */
function pairsForGrantorYear(r, facts, lives, world, snap, i, spouseGifts) {
  const out = new Array(lives.NS + 1).fill(null);
  const grantorGifts = world === 'gift' ? facts.allGifts : facts.priorGifts;
  const add2035 = world === 'gift' && i <= 3 ? facts.G : 0; // §2035(b); C-4: death at the end of year 3 is within 3 years
  for (let j = 1; j <= Math.min(i - 1, lives.NS); j += 1) {
    // the spouse's taxable estate is 0 (everything to the grantor); DSUE per Reg. §20.2010-2(c) (0 without the election)
    const dsueS = r.portability ? dsueLeft({ taxableEstate: 0, lifetimeGifts: spouseGifts, beaAtDeath: X(r, j), topRate: r.tauE }) : 0;
    out[j] = { ...valueEstate(r, snap, i, ['grantor', 'ing'], grantorGifts, dsueS, add2035), ET1: 0, dsue: dsueS, grantorFirst: 0 };
  }
  if (i > lives.NS) return out;
  const state = clone(snap);
  // What cannot pass to the spouse (the §2035(b) add-back) is taxed now; the tax comes out of the marital share and is
  // therefore itself taxable (§2056(b)(4)(A)) — solved by iteration in the statute layer.
  const first = firstDeathWithMaritalDeduction({ nonMaritalItems: add2035, lifetimeGifts: grantorGifts, beaAtDeath: X(r, i), topRate: r.tauE });
  state.E -= first.tax;
  const dsueG = r.portability ? dsueLeft({ taxableEstate: first.taxableEstate, lifetimeGifts: grantorGifts, beaAtDeath: X(r, i), topRate: r.tauE }) : 0;
  const f = inclusionFactor(r);
  for (const lot of state.lots) {
    if (lot.owner === 'grantor' || lot.owner === 'ing') { // passes to the spouse (M-9 for the ING), stepped up to its estate value
      lot.owner = 'spouse';
      lot.basis = lot.isAsset ? lot.value * f : lot.value;
      lot.tax = r.tauOrd; // the survivor pays at the same stack (M-6)
    } else if (lot.owner === 'idgt') lot.owner = 'trust'; // grantor-trust status ends at the grantor's death
  }
  for (let j = i; j <= lives.NS; j += 1) {
    if (j > i) runYear(r, state, j, world);
    out[j] = { ...valueEstate(r, state, j, ['spouse'], spouseGifts, dsueG), ET1: first.tax, dsue: dsueG, grantorFirst: 1 };
  }
  return out;
}

/** Death-year distributions (independent lives, J-1) and the pair shown on rows in deterministic mode. */
export function coupleLives(inp) {
  const deterministic = inp.deathYearOverride != null;
  const G = deathDistribution({ lx: inp.lx, age: inp.age, deathYearOverride: inp.deathYearOverride });
  const S = deathDistribution({ lx: inp.lxSpouse, age: inp.ageSpouse, deathYearOverride: deterministic ? inp.deathYearOverrideSpouse : null });
  const qL = secondDeathByPairs(G.q, S.q);
  return { qG: G.q, qS: S.q, NG: G.N, NS: S.N, NL: qL.length, qL, deterministic, tG: inp.deathYearOverride, tS: inp.deathYearOverrideSpouse };
}

/** Pair table of one world and swap year; for i < s the grantor died before the swap, so the no-swap pairs apply. */
function worldTable(r, facts, lives, world, s, spouseGifts, noSwap) {
  const path = grantorAlivePath(r, facts, world, s, lives.NG);
  if (path.infeasible) return { infeasible: path.infeasible, path };
  const pairs = new Array(lives.NG + 1).fill(null);
  for (let i = 1; i <= lives.NG; i += 1) {
    pairs[i] = noSwap && i < s ? noSwap.pairs[i] : pairsForGrantorYear(r, facts, lives, world, path.snaps[i], i, spouseGifts);
  }
  return { pairs, infeasible: null, path };
}

const ROW_KEYS = ['Hb', 'Hs', 'Eb', 'Es', 'V', 'Vs', 'T', 'TEb', 'TEs', 'ETb', 'ETs', 'SUb', 'SUs', 'ET1', 'dsueHold', 'dsueGift', 'grantorFirst'];
const record = (h, x) => ({
  Hb: h.H, Hs: x.H, Eb: h.E, Es: x.E, V: h.V, Vs: x.V, T: x.T, TEb: h.TE, TEs: x.TE, ETb: h.ET, ETs: x.ET, SUb: h.SU, SUs: x.SU,
  ET1: x.ET1, dsueHold: h.dsue, dsueGift: x.dsue, grantorFirst: x.grantorFirst,
});

/**
 * Rows by the year of the second death: every value is its expectation given t_L = t (model §4). Deterministic mode
 * shows the pair (min(t_G, t), min(t_S, t)) on row t; a year with no chance of a second death shows (min(t, N_G),
 * min(t, N_S)) (display only, weight 0).
 */
function aggregate(lives, hold, gift) {
  const rows = [];
  for (let t = 1; t <= lives.NL; t += 1) {
    const acc = Object.fromEntries(ROW_KEYS.map((k) => [k, 0]));
    let w = 0;
    const add = (i, j, weight) => {
      const x = record(hold[i][j], gift[i][j]);
      for (const k of ROW_KEYS) acc[k] += weight * x[k];
      w += weight;
    };
    if (lives.deterministic) add(Math.min(lives.tG, t), Math.min(lives.tS, t), 1);
    else {
      for (let i = 1; i <= Math.min(t, lives.NG); i += 1) for (let j = 1; j <= Math.min(t, lives.NS); j += 1) {
        if (Math.max(i, j) !== t) continue;
        const weight = lives.qG[i - 1] * lives.qS[j - 1];
        if (weight > 0) add(i, j, weight);
      }
      if (!(w > 0)) add(Math.min(t, lives.NG), Math.min(t, lives.NS), 1);
    }
    const row = { t };
    for (const k of ROW_KEYS) row[k] = acc[k] / w;
    row.dH = row.Hs - row.Hb;
    rows.push(row);
  }
  return rows;
}

/** Σ_{i,j} q^G_i q^S_j v^{max(i,j)} (H^world_ij − H^keep_ij). */
function npvOf(r, lives, hold, gift) {
  let npv = 0;
  for (let i = 1; i <= lives.NG; i += 1) for (let j = 1; j <= lives.NS; j += 1) {
    const w = lives.qG[i - 1] * lives.qS[j - 1];
    if (w !== 0) npv += w * (1 + r.d) ** -Math.max(i, j) * (gift[i][j].H - hold[i][j].H);
  }
  return npv;
}

/**
 * Married-couple evaluation.
 * @param {object} inp  engine-style input (from the planner-facing mapping, ./ui.js)
 * @param {{ swapYears?: 'all' | number[] }} [opts]  swap years to value (s = 0 always). A sample keeps the sweep fast:
 *   the grader then checks the engine's curve at the sampled years and that no sampled year beats the engine's choice.
 */
export function oracleCouple(inp, { swapYears = 'all' } = {}) {
  const r = resolve(inp);
  r.portability = inp.portability ?? true;
  r.PS = inp.PS ?? 0;
  r.XPS = inp.XPS ?? r.X0;
  const facts = giftFacts(r);
  const lives = coupleLives(inp);
  const spouseGifts = r.PS > 0 ? [{ amount: r.PS, bea: r.XPS }] : [];
  const hold = worldTable(r, facts, lives, 'hold', 0, spouseGifts, null);
  const none = worldTable(r, facts, lives, 'gift', 0, spouseGifts, null);
  const ing = worldTable(r, facts, lives, 'ing', 0, spouseGifts, null);
  const tables = new Map([[0, none]]);
  const giftAt = (s) => {
    if (!tables.has(s)) tables.set(s, worldTable(r, facts, lives, 'gift', s, spouseGifts, none));
    return tables.get(s);
  };
  const years = swapYears === 'all'
    ? Array.from({ length: lives.NG }, (_, k) => k + 1)
    : [...new Set(swapYears)].filter((s) => Number.isInteger(s) && s >= 1 && s <= lives.NG).sort((a, b) => a - b);
  const curve = [{ s: 0, npv: npvOf(r, lives, hold.pairs, none.pairs), feasible: true }];
  for (const s of years) {
    const w = giftAt(s);
    curve.push(w.infeasible ? { s, npv: null, feasible: false, reason: w.infeasible } : { s, npv: npvOf(r, lives, hold.pairs, w.pairs), feasible: true });
    tables.delete(s); // keep memory flat on long horizons; rowsAt recomputes on demand
  }
  const feasible = curve.filter((c) => c.feasible);
  const maxNpv = Math.max(...feasible.map((c) => c.npv));
  const star = feasible.find((c) => c.npv >= maxNpv - TIE * Math.max(1, Math.abs(maxNpv)));

  // Deathbed swap: the grantor swaps at the end of the grantor's own death year where feasible (on the alive path).
  let npvPF = 0;
  for (let i = 1; i <= lives.NG; i += 1) {
    if (lives.qG[i - 1] === 0) continue;
    const path = grantorAlivePath(r, facts, 'gift', i, i);
    const row = path.infeasible ? none.pairs[i] : pairsForGrantorYear(r, facts, lives, 'gift', path.snaps[i], i, spouseGifts);
    for (let j = 1; j <= lives.NS; j += 1) {
      const w = lives.qG[i - 1] * lives.qS[j - 1];
      if (w !== 0) npvPF += w * (1 + r.d) ** -Math.max(i, j) * (row[j].H - hold.pairs[i][j].H);
    }
  }
  const npvIng = npvOf(r, lives, hold.pairs, ing.pairs);
  const ingRows = aggregate(lives, hold.pairs, ing.pairs).map((x) => ({ t: x.t, Vn: x.Vs, En: x.Es, TEn: x.TEs, ETn: x.ETs, SUn: x.SUs, Hn: x.Hs, dH: x.dH, dsue: x.dsueGift }));
  // first-death tax on the gift world's §2035(b) add-back, by grantor death year within the window
  const ET1ByYear = [];
  for (let i = 1; i <= Math.min(3, lives.NG); i += 1) {
    ET1ByYear.push(facts.G > 0 ? firstDeathWithMaritalDeduction({ nonMaritalItems: facts.G, lifetimeGifts: facts.allGifts, beaAtDeath: X(r, i), topRate: r.tauE }).tax : 0);
  }
  const expected = (q) => q.reduce((a, p, k) => a + p * (k + 1), 0);
  return {
    married: true, lives, facts, curve, maxNpv, sStar: star.s, npvNone: curve[0].npv, npvOpt: star.npv, npvPF, npvIng,
    N: lives.NL, q: lives.deterministic ? lives.qL.map((_, k) => (k === lives.NL - 1 ? 1 : 0)) : lives.qL,
    expectedDeathYear: lives.deterministic ? lives.NL : expected(lives.qL),
    expectedGrantorDeathYear: expected(lives.qG),
    rowsAt: (s) => { const w = giftAt(s); return w.infeasible ? null : aggregate(lives, hold.pairs, w.pairs); },
    npvAt: (s) => { const w = giftAt(s); return w.infeasible ? null : npvOf(r, lives, hold.pairs, w.pairs); },
    feasibleAt: (s) => !giftAt(s).infeasible,
    ingRows,
    // the grantor's liquidity while the grantor pays the burn (grantor-alive gift path), and the ING's fee liquidation
    aliveE: (s) => giftAt(s).path.snaps.slice(1).map((x) => x.E),
    ingLiquidates: ing.path.liquidated,
    ET1ByYear,
    eff: { none: facts.Ug > 0 ? curve[0].npv / facts.Ug : null, opt: facts.Ug > 0 ? star.npv / facts.Ug : null },
    effPerGiftTax: { none: facts.G > 0 ? curve[0].npv / facts.G : null, opt: facts.G > 0 ? star.npv / facts.G : null },
    effPerFMV: { none: curve[0].npv / r.FMV, opt: star.npv / r.FMV },
  };
}

/** ING vs IDGT verdict for a married couple, with the documented tie tolerance. */
export function coupleIngVerdict(oc, npvOpt = oc.npvOpt) {
  const deltaOpt = oc.npvIng - npvOpt;
  const tol = TIE * Math.max(1, Math.abs(npvOpt));
  return { npv: oc.npvIng, deltaOpt, deltaNone: oc.npvIng - oc.npvNone, verdict: deltaOpt > tol ? 'ING' : deltaOpt < -tol ? 'IDGT' : 'tie' };
}
