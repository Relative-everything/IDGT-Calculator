// UI state → engine → results, as one pure function. useIdgtModel memoises it; the eval suite (evals/) and the tests call
// it directly, so what is verified is exactly what the app runs. No React.
import { evaluateAsset, resolveSwapProfile } from '../engine/idgtModel.js';
import { evaluateIng } from '../engine/ingModel.js';
import { validateInputs } from '../engine/validate.js';
import { rankAssets } from '../engine/ranking.js';
import { lifeExpectancyYears } from '../engine/mortality.js';
import { buildEngineInputs, validateUiFields, FIELD_LABELS, lifeTableFor } from './buildInputs.js';

/**
 * @param {{ grantor:object, estate:object, settings:object, assets:object[] }} state - UI state
 * @returns {{ perAsset: object[], ranked: object[], remainingExclusion: number|null, neutralSwapYield: number|null,
 *   neutralSwap: { bSw:number, gSw:number, ySw:number, tauSw:number }|null, swapRates: { rE:number, tauOrd:number }|null,
 *   mortality: object }}
 */
export function computeModel({ grantor, estate, settings, assets }) {
  const perAsset = assets.map((asset) => {
    const uiErrors = validateUiFields({ grantor, estate, settings, asset });
    const inputs = buildEngineInputs({ grantor, estate, settings, asset });
    if (uiErrors.length) return { id: asset.id, name: asset.name, inputs, errors: uiErrors, warnings: [], result: null };
    const { errors, warnings } = validateInputs(inputs);
    const labelled = errors.map((x) => ({ ...x, label: FIELD_LABELS[x.field] ?? x.field }));
    if (labelled.length) return { id: asset.id, name: asset.name, inputs, errors: labelled, warnings, result: null };
    try {
      const result = evaluateAsset(inputs);
      const ing = evaluateIng(inputs, result); // ING comparison on the same ledger (ING model.md §3–§5)
      return { id: asset.id, name: asset.name, inputs, errors: [], warnings: result.warnings, result, ing };
    } catch (err) {
      return { id: asset.id, name: asset.name, inputs, errors: [{ field: 'engine', label: 'Model', message: err.message }], warnings, result: null };
    }
  });
  const ok = perAsset.filter((a) => a.result);
  const remainingExclusion = ok.length ? ok[0].result.derived.R : null;
  const ranked = rankAssets(ok, { key: settings.rankKey === 'none' ? 'none' : 'opt', remainingExclusion: remainingExclusion ?? Infinity });
  // The grantor and estate panels are shared, so every asset carries the same rates: the swap consideration's neutral
  // profile (settings panel text, and the seed when "Customise" is switched on) is read off the first asset's inputs.
  let neutralSwap = null;
  let swapRates = null;
  if (perAsset[0]) {
    const { rE, tauOrd } = perAsset[0].inputs;
    if (Number.isFinite(rE) && Number.isFinite(tauOrd) && tauOrd < 1) {
      neutralSwap = resolveSwapProfile({ rE, tauOrd });
      swapRates = { rE, tauOrd };
    }
  }
  return { perAsset, ranked, remainingExclusion, neutralSwapYield: neutralSwap?.ySw ?? null, neutralSwap, swapRates, mortality: mortalitySummary(grantor, ok[0]) };
}

/**
 * What the grantor panel shows about mortality: the chosen table and its verification, and the life expectancies the
 * engine's death-year probabilities imply (grantor, spouse, and the second death for a couple). Shared by all assets.
 */
function mortalitySummary(grantor, first) {
  const table = lifeTableFor(grantor.lifeTable);
  const out = {
    table: { id: table.id, label: table.label, verified: table.verified },
    married: Boolean(grantor.married), deterministic: Boolean(grantor.useDeathYear), grantorYears: null, spouseYears: null, secondDeathYears: null,
  };
  if (!first || grantor.useDeathYear) return out;
  const lives = first.result.lives;
  out.grantorYears = lifeExpectancyYears(lives.qG);
  if (lives.married) {
    out.spouseYears = lifeExpectancyYears(lives.qS);
    out.secondDeathYears = lifeExpectancyYears(lives.qL);
  }
  return out;
}
