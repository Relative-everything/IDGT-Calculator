// Engine entry point — re-exports only. All calculation lives in the sibling modules.
// See docs/changes/2026-09-26-idgt-rebuild/model.md for the model contract.

export { simulate, aggregate, evaluateAsset, resolveSwapProfile, SWAP_INFEASIBLE_POST_SALE, SWAP_INFEASIBLE_LIQUIDITY } from './idgtModel.js';
export { deriveGift, makeBases, exclusionAt, taxFromBase, tentativeTax, estateTaxByBrackets } from './fedTax.js';
export { lxColumn, validateLx, deathProbabilities, expectedDeathYear } from './mortality.js';
export { validateInputs } from './validate.js';
export { rankAssets } from './ranking.js';
export * from './constants.js';
