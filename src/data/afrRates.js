// AFR rates are published monthly in IRS Revenue Rulings (e.g., Rev. Rul. 2025-XX).
// Installment sales to IDGTs require the note interest rate to be at least the applicable AFR
// per IRC §7872; rates below AFR trigger imputed interest and potential gift tax consequences.

// NOTE: These are default rates for January 2025 and must be updated each month.
export const AFR_RATES = {
  shortTerm: 0.0489, // January 2025 short-term AFR
  midTerm: 0.0421,   // January 2025 mid-term AFR
  longTerm: 0.0417,  // January 2025 long-term AFR
};

/**
 * Validate that a proposed installment note rate meets or exceeds the applicable AFR.
 * @param {number} proposedRate - Annual nominal interest rate (decimal, e.g., 0.05 for 5%).
 * @param {'short'|'mid'|'long'} term - AFR term category.
 */
export function validateNoteRate(proposedRate, term) {
  const normalizedTerm = (term || '').toString().toLowerCase();
  const afrKey = normalizedTerm === 'short' ? 'shortTerm'
    : normalizedTerm === 'mid' ? 'midTerm'
    : normalizedTerm === 'long' ? 'longTerm'
    : null;

  if (!afrKey) {
    return {
      valid: false,
      minimumRequired: NaN,
      message: `Term must be 'short', 'mid', or 'long'`,
    };
  }

  const minimumRequired = AFR_RATES[afrKey];
  const valid = typeof proposedRate === 'number' && proposedRate >= minimumRequired;

  return {
    valid,
    minimumRequired,
    message: valid
      ? `Proposed rate meets or exceeds the ${normalizedTerm}-term AFR (${(minimumRequired * 100).toFixed(2)}%).`
      : `Proposed rate is below the ${normalizedTerm}-term AFR (${(minimumRequired * 100).toFixed(2)}%). This can trigger imputed interest under IRC §7872 and gift tax on the forgone interest.`,
  };
}
