// Engine entry point — re-exports only. All calculation lives in the sibling modules.
// See docs/changes/2026-09-26-idgt-rebuild/model.md (v1 gift ledger) and
// docs/changes/2026-09-27-ing-comparison/model.md (ING comparison, burn share) for the model contracts.

export { simulate, aggregate, evaluateAsset, resolveSwapProfile, SWAP_INFEASIBLE_POST_SALE, SWAP_INFEASIBLE_LIQUIDITY } from './idgtModel.js';
export { simulateIng, evaluateIng, IDGT_BRIDGE_KEYS, ING_COMPONENT_KEYS } from './ingModel.js';
export {
  solveRoot, withStateRate, withBurnShare, withOtherEstate, compare, breakevens, comparisonGrid,
  REASON_ING_ALWAYS, REASON_IDGT_ALWAYS, REASON_NOT_EVALUABLE,
} from './breakeven.js';
export { deriveGift, makeBases, exclusionAt, taxFromBase, tentativeTax, estateTaxByBrackets } from './fedTax.js';
export { lxColumn, validateLx, deathProbabilities, expectedDeathYear } from './mortality.js';
export { validateInputs, validateIngInputs, resolveIngInputs } from './validate.js';
export { rankAssets } from './ranking.js';
export * from './constants.js';
