// CLEAN-ROOM ORACLE — probability weighting, swap search, efficiency, ING comparison and ranking.
// Independent of src/engine (imports nothing from it).

import { worldHold, worldGift, worldIng, giftFacts, resolve } from './worlds.js';

/**
 * Death-year distribution from a survivors column l_x (actuarial definition): the probability that a life aged
 * x dies in year t is (l_{x+t−1} − l_{x+t}) / l_x. The column is closed at the first zero after x, or at the end
 * of the table (all remaining lives die in the last year).
 */
export function deathDistribution(inp) {
  if (inp.deathYearOverride != null) {
    const q = Array.from({ length: inp.deathYearOverride }, (_, i) => (i === inp.deathYearOverride - 1 ? 1 : 0));
    return { q, N: inp.deathYearOverride };
  }
  const { lx, age } = inp;
  let end = lx.length;
  for (let a = age + 1; a < lx.length; a += 1) if (lx[a] === 0) { end = a; break; }
  const l = (a) => (a >= end ? 0 : lx[a]);
  const N = end - age;
  const q = [];
  for (let t = 1; t <= N; t += 1) q.push((l(age + t - 1) - l(age + t)) / lx[age]);
  return { q, N };
}

const TIE = 1e-6; // the calculator's stated tie rule: within 1e-6·max(1,|NPV|) prefer no swap, then the earlier year

/** Everything the calculator reports for one asset, recomputed from the worlds. */
export function oracleEvaluate(inp) {
  const r = resolve(inp);
  const { q, N } = deathDistribution(inp);
  const df = (t) => (1 + r.d) ** -t;
  const hold = worldHold(inp, N);
  const npvOf = (gift) => gift.rows.reduce((a, row, i) => a + q[i] * df(row.t) * (row.H - hold.rows[i].H), 0);

  const none = worldGift(inp, N, 0);
  const curve = [{ s: 0, npv: npvOf(none), feasible: true }];
  const sims = { 0: none };
  for (let s = 1; s <= N; s += 1) {
    const sim = worldGift(inp, N, s);
    if (sim.infeasible) { curve.push({ s, npv: null, feasible: false, reason: sim.infeasible }); continue; }
    sims[s] = sim;
    curve.push({ s, npv: npvOf(sim), feasible: true });
  }
  // Tie rule as documented: the best NPV; any candidate within tolerance of it → prefer none, then smallest s.
  const feasible = curve.filter((c) => c.feasible);
  const maxNpv = Math.max(...feasible.map((c) => c.npv));
  const tol = TIE * Math.max(1, Math.abs(maxNpv));
  const star = feasible.find((c) => c.npv >= maxNpv - tol);

  // Deathbed-swap value: swap at the end of the death year where feasible, else no swap.
  let npvPF = 0;
  for (let t = 1; t <= N; t += 1) {
    const sim = sims[t] ?? none;
    npvPF += q[t - 1] * df(t) * (sim.rows[t - 1].H - hold.rows[t - 1].H);
  }

  const facts = giftFacts(r);
  const per = (x, den) => (den > 0 ? x / den : null);
  return {
    q, N, facts, hold, sims, curve,
    npvNone: curve[0].npv,
    npvOpt: star.npv,
    sStar: star.s,
    maxNpv,
    npvPF,
    eff: { none: per(curve[0].npv, facts.Ug), opt: per(star.npv, facts.Ug) },
    effPerGiftTax: { none: per(curve[0].npv, facts.G), opt: per(star.npv, facts.G) },
    effPerFMV: { none: curve[0].npv / r.FMV, opt: star.npv / r.FMV },
    expectedDeathYear: q.reduce((a, p, i) => a + p * (i + 1), 0),
  };
}

/** ING NPV and its comparison with the IDGT at the IDGT's optimal swap year and with no swap. */
export function oracleIng(inp, idgt = oracleEvaluate(inp)) {
  const r = resolve(inp);
  const ing = worldIng(inp, idgt.N);
  const df = (t) => (1 + r.d) ** -t;
  const npv = ing.rows.reduce((a, row, i) => a + idgt.q[i] * df(row.t) * (row.H - idgt.hold.rows[i].H), 0);
  const deltaOpt = npv - idgt.npvOpt;
  const tol = TIE * Math.max(1, Math.abs(idgt.npvOpt));
  const verdict = deltaOpt > tol ? 'ING' : deltaOpt < -tol ? 'IDGT' : 'tie';
  return { npv, rows: ing.rows, deltaOpt, deltaNone: npv - idgt.npvNone, verdict, npvPerFMV: npv / r.FMV };
}

/**
 * Ranking as documented: NPV per dollar of taxable gift (rank key opt or none); a zero taxable gift ranks first
 * with a positive NPV and last otherwise; ties broken by NPV. Cumulative taxable gift in rank order.
 */
export function oracleRank(items, key, remainingExclusion) {
  const scored = items.map((it) => {
    const npv = key === 'none' ? it.npvNone : it.npvOpt;
    const e = key === 'none' ? it.eff.none : it.eff.opt;
    // mathematically equal efficiencies (agreeing to 12 significant digits) are ties, broken by NPV as documented
    return { ...it, k: e != null ? (e === 0 ? 0 : Number(e.toPrecision(12))) : npv > 0 ? Infinity : -Infinity, npv };
  });
  scored.sort((a, b) => (a.k === b.k ? b.npv - a.npv : b.k - a.k));
  let cum = 0;
  return scored.map((it, i) => { cum += it.Ug; return { id: it.id, rank: i + 1, cumulative: cum, exceeds: cum > remainingExclusion }; });
}
