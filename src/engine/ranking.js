// Ranking of evaluated assets (model.md §9). Pure, no React.
//
// Rank key: NPV per dollar of taxable gift value (U_g = FMV × (1 − discount) − annual exclusions),
// i.e. per dollar of exclusion-equivalent consumed, using the optimal fixed swap year by default.
// A greedy cumulative exclusion column shows where the grantor's remaining exclusion runs out if the
// assets are gifted in rank order (joint optimisation is a v2 item).

/**
 * @param {{id:string, name:string, result:object}[]} evaluated
 * @param {{ key?: 'opt'|'none', remainingExclusion?: number }} options
 * @returns {object[]} rows sorted by rank with rank, cumulative taxable gift and exclusion flags
 */
export function rankAssets(evaluated, { key = 'opt', remainingExclusion = Infinity } = {}) {
  const scored = evaluated.map((e) => {
    const r = e.result;
    const npv = key === 'none' ? r.npvNone : r.npvOpt;
    const effValue = key === 'none' ? r.eff.none : r.eff.opt;
    return { ...e, rankKey: effValue, rankNpv: npv };
  });
  scored.sort((a, b) => {
    const ak = a.rankKey ?? -Infinity;
    const bk = b.rankKey ?? -Infinity;
    if (bk !== ak) return bk - ak;
    return (b.rankNpv ?? -Infinity) - (a.rankNpv ?? -Infinity);
  });
  let cumulative = 0;
  return scored.map((row, i) => {
    cumulative += row.result.derived.Ug;
    return {
      ...row,
      rank: i + 1,
      cumulativeTaxableGift: cumulative,
      exceedsRemainingExclusion: cumulative > remainingExclusion,
    };
  });
}
