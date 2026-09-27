// Settings transitions that depend on the current inputs. Pure, no React; components call these from event handlers.
import { resolveSwapProfile } from '../engine/idgtModel.js';

// Percent strings for seeded fields: 12 significant digits keep the round trip through the UI's % parsing neutral to
// well below a cent, while the field stays readable.
const SEED_SIGNIFICANT_DIGITS = 12;
const pctString = (x) => String(Number((x * 100).toPrecision(SEED_SIGNIFICANT_DIGITS)));

/**
 * The "Customise the consideration" switch. Switching it ON seeds the four fields with the return-neutral profile for
 * the CURRENT rates (engine resolveSwapProfile: basis 100%, no growth, yield r_E/(1 − τ_ord), rate τ_ord; for r_E < 0
 * depreciation at r_E and no yield), so the switch alone never changes a result; the planner then edits from there. Before this (docs/changes/2026-09-27-math-evals,
 * F5) the fields kept the app-default 5.535% / 45.8%, which are neutral only at the default 3% growth and 45.8% stack, so
 * switching on at any other rates silently moved every NPV and raised NON_NEUTRAL_SWAP. Switching OFF keeps the values.
 *
 * @param {object} settings - UI settings
 * @param {boolean} on
 * @param {{ rE:number, tauOrd:number }} rates - the current other-estate growth and grantor ordinary stack (decimals)
 */
export function toggleSwapCustom(settings, on, { rE, tauOrd } = {}) {
  if (!on) return { ...settings, swapCustom: false };
  if (!(Number.isFinite(rE) && Number.isFinite(tauOrd) && tauOrd >= 0 && tauOrd < 1)) return { ...settings, swapCustom: true };
  const p = resolveSwapProfile({ rE, tauOrd });
  return {
    ...settings,
    swapCustom: true,
    swapBasisPct: pctString(p.bSw),
    swapGrowth: pctString(p.gSw),
    swapYield: pctString(p.ySw),
    swapTaxRate: pctString(p.tauSw),
  };
}
