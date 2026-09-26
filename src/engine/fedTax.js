// Federal estate and gift tax mechanics (model.md §2). Pure functions, no React.
//
// Authorities: IRC §2001(b) (tentative tax on taxable estate + adjusted taxable gifts, less gift tax
// payable on post-1976 gifts computed with the exclusion of the gift year, §2001(g)(2)); §2001(c)
// (rate schedule, flat 40% above $1,000,000); §2001(f) (gift values frozen once the limitations period
// runs); §2010(c) as amended by OBBBA §70106 (basic exclusion $15,000,000 for 2026, indexed after);
// Reg. §20.2010-1(c) (anti-clawback: credit based on the greater of the exclusion at death or the
// exclusion allowed for lifetime gifts); §2502(c) (donor pays gift tax — tax-exclusive); §1015(a),(d)(6)
// (carryover basis plus gift tax attributable to net appreciation).

import { SECTION_2001C_BRACKETS } from '../data/estateTaxRates.js';

/**
 * Tentative tax under the §2001(c) bracket schedule on a cumulative taxable amount.
 * Used only for the cross-check test of the flat-rate reduction.
 */
export function tentativeTax(amount, brackets = SECTION_2001C_BRACKETS) {
  if (!(amount > 0)) return 0;
  let tax = 0;
  for (let i = 0; i < brackets.length; i += 1) {
    const lo = brackets[i].threshold;
    const hi = i + 1 < brackets.length ? brackets[i + 1].threshold : Infinity;
    if (amount <= lo) break;
    tax += (Math.min(amount, hi) - lo) * brackets[i].rate;
  }
  return tax;
}

/**
 * Estate tax by the full §2001(b) computation with the bracket schedule (cross-check only):
 * max(0, tentative(TE + ATG) - giftTaxPayable - tentative(applicableExclusion)).
 */
export function estateTaxByBrackets({ TE, adjustedTaxableGifts = 0, giftTaxPayable = 0, applicableExclusion }) {
  return Math.max(0, tentativeTax(TE + adjustedTaxableGifts) - giftTaxPayable - tentativeTax(applicableExclusion));
}

/**
 * Gift-side derived constants for one asset (model.md §2).
 * @returns {{Ug:number, usedPrior:number, R:number, Uc:number, G:number, BT0:number}}
 */
export function deriveGift({ FMV, delta = 0, annualExclusions = 0, B0, X0, P = 0, XP = X0, tauE }) {
  const Ug = Math.max(0, FMV * (1 - delta) - annualExclusions); // adjusted taxable gift, §2001(b)(1)(B)
  const usedPrior = Math.min(P, XP); // exclusion consumed by prior gifts in their own year
  const R = Math.max(0, X0 - usedPrior); // exclusion remaining for this gift
  const Uc = Math.min(Ug, R); // exclusion consumed now
  const G = tauE * Math.max(0, Ug - R); // gift tax paid, tax-exclusive (§2502(c))
  // §1015(d)(6): basis increased by gift tax attributable to net appreciation; never above FMV of the gift.
  const BT0 = B0 + (G > 0 && Ug > 0 ? G * Math.max(0, Ug - B0) / Ug : 0);
  return { Ug, usedPrior, R, Uc, G, BT0 };
}

/**
 * Applicable exclusion in the t-th projection year (t = 1 is the gift year, fixed by statute).
 * Convention C-7: no $10,000 round-down.
 */
export function exclusionAt({ X0, pi }, t) {
  return X0 * Math.pow(1 + pi, t - 1);
}

/**
 * Taxable-base functions in "base dollars" so that tax = tauE * max(0, base). Exact for any
 * exclusion >= $1,000,000 (the $345,800 constants of §2001(c) cancel between tentative tax and credit).
 *
 * baseHold(TE, t) = TE + P - max(0, P - XP) - max(X_t, min(P, XP))
 * baseGift(TE, t) = TE + P + Ug - max(0, P - XP) - max(0, Ug - R) - max(X_t, min(P, XP) + Uc)
 *   where max(0, P - XP) and max(0, Ug - R) are the taxable-gift amounts whose gift tax is credited
 *   under §2001(b)(2), and the last term is the anti-clawback applicable exclusion (Reg. §20.2010-1(c)).
 */
export function makeBases({ X0, pi, P = 0, XP = X0, Ug, R, Uc }) {
  const usedPrior = Math.min(P, XP);
  const priorTaxable = Math.max(0, P - XP);
  const currentTaxable = Math.max(0, Ug - R);
  return {
    exclusionAt: (t) => exclusionAt({ X0, pi }, t),
    baseHold: (TE, t) => TE + P - priorTaxable - Math.max(exclusionAt({ X0, pi }, t), usedPrior),
    baseGift: (TE, t) => TE + P + Ug - priorTaxable - currentTaxable - Math.max(exclusionAt({ X0, pi }, t), usedPrior + Uc),
  };
}

/** Federal tax from a base: tauE * max(0, base). */
export function taxFromBase(tauE, base) {
  return tauE * Math.max(0, base);
}
