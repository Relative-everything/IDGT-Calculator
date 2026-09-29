// Inputs audit: the per-asset facts a planner ties to source documents, and batch control totals.
// Pure functions, no React. Contract: docs/changes/2026-09-28-inputs-audit/plan.md.
//
// Batch control totals are the standard check on keyed data: the record count and the sums of the key columns are
// compared with the same totals on the source (an Excel SUM row, a balance-sheet subtotal). Totals skip values that do
// not parse and report how many they skipped, so an unreadable cell can never hide inside a total.

/** Money is shown and footed to the cent. */
export const CENTS_PER_DOLLAR = 100;

/**
 * Facts of one asset row, from the inputs as the model reads them (decimals; money unrounded).
 *   giftValue       value of the gifted interest after the valuation discount (§2512(a); Reg. §25.2512-1)
 *   discountAmount  FMV − giftValue
 *   taxableGift     giftValue less the §2503(b) annual exclusions, floored at 0 — the engine's U_g (fedTax.deriveGift)
 *   unrealizedGain  FMV − basis; negative is a built-in loss (§1001(a))
 * A non-finite input makes the facts that depend on it NaN.
 * @param {{ FMV:number, delta:number, annualExclusions:number, B0:number }} p
 */
export function assetAuditFacts({ FMV, delta, annualExclusions, B0 }) {
  const giftValue = FMV * (1 - delta);
  return {
    giftValue,
    discountAmount: FMV - giftValue,
    taxableGift: Math.max(0, giftValue - annualExclusions),
    unrealizedGain: FMV - B0,
  };
}

/** A value's share of a total (e.g. one asset's FMV of the candidates' total); null when the total is not positive. */
export function shareOfTotal(value, total) {
  return Number.isFinite(value) && Number.isFinite(total) && total > 0 ? value / total : null;
}

/**
 * Column sums over the asset rows.
 * With `cents`, a money column foots the way a printed or Excel schedule does: every line is shown to the cent, so the
 * total is the sum of the cent-rounded lines, added in whole cents (exact; no binary floating-point drift). Rounding is
 * half up, as in the register's cells (inputRegister.bare), so the totals row equals SUM() over the pasted cells.
 * @param {object[]} rows - one object per asset with numeric fields
 * @param {string[]} fields
 * @param {{ cents?: boolean }} [opts]
 * @returns {{ count:number } & Record<string, { sum:number, skipped:number }>}
 */
export function controlTotals(rows, fields, { cents = false } = {}) {
  const out = { count: rows.length };
  for (const f of fields) {
    let sum = 0;
    let skipped = 0;
    for (const r of rows) {
      const v = r[f];
      if (Number.isFinite(v)) sum += cents ? Math.round(v * CENTS_PER_DOLLAR) : v;
      else skipped += 1;
    }
    out[f] = { sum: cents ? sum / CENTS_PER_DOLLAR : sum, skipped };
  }
  return out;
}

/**
 * Balance-sheet tie-out. Each asset is priced marginally against E₀, the other estate excluding that asset (v1 model.md
 * §0 item 5 and §1), so the
 * other estate plus ALL candidates is the figure to compare with the client's net worth: if the other estate already
 * includes the candidates, this total double-counts them; if it excludes them, each asset's run leaves out the others.
 * The total foots its two lines as shown to the cent (whole-cent addition, as in controlTotals).
 * @returns {{ otherEstate:number, candidates:number, total:number }}
 */
export function balanceSheetTieOut({ otherEstate, candidatesFmv }) {
  const cents = (v) => Math.round(v * CENTS_PER_DOLLAR);
  return { otherEstate, candidates: candidatesFmv, total: (cents(otherEstate) + cents(candidatesFmv)) / CENTS_PER_DOLLAR };
}
