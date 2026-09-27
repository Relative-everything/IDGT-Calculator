// Normalise engine and oracle results into one comparable "view" so graders compare like with like.

export function engineView(res, ing) {
  const row = (r) => ({
    t: r.t, V: r.V, Vs: r.Vs, Eb: r.Eb, Es: r.Es, T: r.T, TEb: r.TEb, TEs: r.TEs,
    ETb: r.ETb, ETs: r.ETs, SUb: r.SUb, SUs: r.SUs, Hb: r.Hb, Hs: r.Hs, dH: r.dH,
  });
  return {
    N: res.derived.N,
    q: res.q,
    expectedDeathYear: res.derived.expectedDeathYear,
    derived: { Ug: res.derived.Ug, R: res.derived.R, Uc: res.derived.Uc, G: res.derived.G, BT0: res.derived.BT0 },
    npvNone: res.npvNone, npvOpt: res.npvOpt, sStar: res.sStar, npvPF: res.npvPF,
    eff: res.eff, effPerGiftTax: res.effPerGiftTax, effPerFMV: res.effPerFMV,
    curve: res.npvCurve.map((c) => ({ s: c.s, npv: c.npv, feasible: c.feasible })),
    rowsNone: res.rows.none.map(row),
    rowsOpt: res.rows.opt.map(row),
    ing: ing ? {
      npv: ing.npv, deltaOpt: ing.vsIdgt.deltaOpt, deltaNone: ing.vsIdgt.deltaNone, verdict: ing.vsIdgt.verdict,
      rows: ing.rows.map((r) => ({ t: r.t, Vn: r.Vn, En: r.En, TEn: r.TEn, ETn: r.ETn, SUn: r.SUn, Hn: r.Hn, dH: r.dH })),
    } : null,
  };
}

export function oracleView(o, oi, sStar = o.sStar) {
  const rows = (sim) => sim.rows.map((g, i) => {
    const h = o.hold.rows[i];
    return {
      t: g.t, V: h.V, Vs: g.Vs, Eb: h.E, Es: g.E, T: g.T, TEb: h.grossEstate, TEs: g.grossEstate,
      ETb: h.ET, ETs: g.ET, SUb: h.CGT, SUs: g.CGT, Hb: h.H, Hs: g.H, dH: g.H - h.H,
    };
  });
  return {
    N: o.N,
    q: o.q,
    expectedDeathYear: o.expectedDeathYear,
    derived: { Ug: o.facts.Ug, R: o.facts.R, Uc: o.facts.Uc, G: o.facts.G, BT0: o.facts.BT0 },
    npvNone: o.npvNone, npvOpt: o.npvOpt, sStar: o.sStar, npvPF: o.npvPF, maxNpv: o.maxNpv,
    eff: o.eff, effPerGiftTax: o.effPerGiftTax, effPerFMV: o.effPerFMV,
    curve: o.curve.map((c) => ({ s: c.s, npv: c.npv, feasible: c.feasible })),
    rowsNone: rows(o.sims[0]),
    // compare the ledger at the ENGINE's chosen swap year when it is feasible in the oracle (tie-aware grading)
    rowsOpt: rows(o.sims[sStar] ?? o.sims[o.sStar]),
    ing: oi ? {
      npv: oi.npv, deltaOpt: oi.deltaOpt, deltaNone: oi.deltaNone, verdict: oi.verdict,
      rows: oi.rows.map((r, i) => ({ t: r.t, Vn: r.Vn, En: r.E, TEn: r.grossEstate, ETn: r.ET, SUn: r.CGT, Hn: r.H, dH: r.H - o.hold.rows[i].H })),
    } : null,
  };
}

/** Read a dotted path used by the hand-calculation cases from a view. */
export function readPath(view, path) {
  const parts = path.split('.');
  if (parts[0] === 'row') return view[parts[1] === 'none' ? 'rowsNone' : 'rowsOpt'][Number(parts[2]) - 1]?.[parts[3]];
  if (parts[0] === 'curve') return view.curve.find((c) => c.s === Number(parts[1]))?.npv;
  if (parts[0] === 'curveFeasible') return view.curve.find((c) => c.s === Number(parts[1]))?.feasible;
  if (parts[0] === 'ing' && parts[1] === 'row') return view.ing?.rows[Number(parts[2]) - 1]?.[parts[3]];
  if (parts[0] === 'ing') return view.ing?.[parts[1]];
  if (parts[0] === 'derived') return view.derived[parts[1]];
  return view[path];
}
