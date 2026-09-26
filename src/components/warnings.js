// Text for engine warnings ({code, data}). Formatting lives here, not in the engine.
import { fmtMoney, fmtPct } from './format.js';

const TEXT = {
  BUILT_IN_LOSS: () => 'Basis exceeds FMV: under the §1015 dual-basis rule the loss is not usable by the trust (loss basis = gift value) and would be stepped DOWN at death if kept. Consider harvesting the loss before gifting.',
  PRE_OBBBA_EXCLUSION: (d) => `Basic exclusion ${fmtMoney(d.X0)} is below the 2026 statutory ${fmtMoney(d.statutory)} (OBBBA §70106); treated as a legislative scenario.`,
  PRIOR_GIFT_TAX: (d) => `Prior gifts (${fmtMoney(d.P)}) exceeded that year's exclusion (${fmtMoney(d.XP)}): gift tax is assumed to have been paid at the current rate and is credited under §2001(b)(2).`,
  NON_NEUTRAL_SWAP: (d) => `The swap consideration earns ${fmtPct(d.afterTaxReturn, 2)} after tax versus ${fmtPct(d.rE, 2)} for the other estate; the difference is booked in the "residual" component, not as a tax benefit.`,
  MORTALITY_TABLE_TRUNCATED: () => 'The mortality table does not reach zero survivors; the residual probability is assigned to its final year.',
  ZERO_TAXABLE_GIFT: () => 'Taxable gift value is zero (annual exclusions cover the gift), so NPV per gift dollar is undefined; the asset is ranked by the sign of its NPV.',
  SALE_BEYOND_HORIZON: (d) => `Sale year ${d.S} is beyond the projection horizon (${d.N} years) and is treated as never.`,
  GRANTOR_ILLIQUID: (d) => `The other estate is exhausted from year ${d.year} (age ${d.age}; probability of surviving to that year ${fmtPct(d.survival, 1)}) ${d.swapYear > 0 ? `with the year-${d.swapYear} swap` : 'without a swap'}: the income-tax burn${d.giftTaxPaid ? ' and gift tax' : ''} exceed it. Arithmetic continues with a negative balance; consider a discretionary tax-reimbursement clause (Rev. Rul. 2004-64) or a smaller gift.`,
};

export function describeWarning(w) {
  const fn = TEXT[w.code];
  return fn ? fn(w.data ?? {}) : w.message ?? w.code;
}
