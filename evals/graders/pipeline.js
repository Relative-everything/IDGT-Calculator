// The UI → engine → results pipeline exactly as the app runs it. Uses the app's own pure pipeline function
// (src/hooks/computeModel.js) when it exists; before that refactor the body of useIdgtModel's useMemo is
// reproduced here line for line (it cannot be called outside React).

import { evaluateAsset } from '../../src/engine/idgtModel.js';
import { evaluateIng } from '../../src/engine/ingModel.js';
import { validateInputs } from '../../src/engine/validate.js';
import { rankAssets } from '../../src/engine/ranking.js';
import { buildEngineInputs, validateUiFields, FIELD_LABELS } from '../../src/hooks/buildInputs.js';

let appPipeline = null;
try {
  ({ computeModel: appPipeline } = await import('../../src/hooks/computeModel.js'));
} catch {
  appPipeline = null;
}

export const PIPELINE_SOURCE = appPipeline ? 'src/hooks/computeModel.js (the app\'s own function)' : 'replica of useIdgtModel (pre-refactor)';

function replica({ grantor, estate, settings, assets }) {
  const perAsset = assets.map((asset) => {
    const uiErrors = validateUiFields({ grantor, estate, settings, asset });
    const inputs = buildEngineInputs({ grantor, estate, settings, asset });
    if (uiErrors.length) return { id: asset.id, name: asset.name, inputs, errors: uiErrors, warnings: [], result: null };
    const { errors, warnings } = validateInputs(inputs);
    const labelled = errors.map((x) => ({ ...x, label: FIELD_LABELS[x.field] ?? x.field }));
    if (labelled.length) return { id: asset.id, name: asset.name, inputs, errors: labelled, warnings, result: null };
    try {
      const result = evaluateAsset(inputs);
      const ing = evaluateIng(inputs, result);
      return { id: asset.id, name: asset.name, inputs, errors: [], warnings: result.warnings, result, ing };
    } catch (err) {
      return { id: asset.id, name: asset.name, inputs, errors: [{ field: 'engine', label: 'Model', message: err.message }], warnings, result: null };
    }
  });
  const ok = perAsset.filter((a) => a.result);
  const remainingExclusion = ok.length ? ok[0].result.derived.R : null;
  const ranked = rankAssets(ok, { key: settings.rankKey === 'none' ? 'none' : 'opt', remainingExclusion: remainingExclusion ?? Infinity });
  return { perAsset, ranked, remainingExclusion };
}

export function runPipeline(state) {
  return (appPipeline ?? replica)(state);
}
