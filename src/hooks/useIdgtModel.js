// State → engine → results. The only place the UI calls the engine.
import { useDeferredValue, useMemo } from 'react';
import { evaluateAsset, resolveSwapProfile } from '../engine/idgtModel.js';
import { evaluateIng } from '../engine/ingModel.js';
import { validateInputs } from '../engine/validate.js';
import { rankAssets } from '../engine/ranking.js';
import { buildEngineInputs, validateUiFields, FIELD_LABELS } from './buildInputs.js';

/**
 * @returns {{ perAsset: object[], ranked: object[], remainingExclusion: number|null, neutralSwapYieldPct: string|null, isStale: boolean }}
 */
export function useIdgtModel({ grantor, estate, settings, assets }) {
  // Defer each part separately so an unrelated re-render (row selection, a notice) does not recompute.
  const g = useDeferredValue(grantor);
  const e = useDeferredValue(estate);
  const s = useDeferredValue(settings);
  const list = useDeferredValue(assets);
  const isStale = g !== grantor || e !== estate || s !== settings || list !== assets;

  const model = useMemo(() => {
    const perAsset = list.map((asset) => {
      const uiErrors = validateUiFields({ grantor: g, estate: e, settings: s, asset });
      const inputs = buildEngineInputs({ grantor: g, estate: e, settings: s, asset });
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
    const ranked = rankAssets(ok, { key: s.rankKey === 'none' ? 'none' : 'opt', remainingExclusion: remainingExclusion ?? Infinity });
    // Gross yield of the default (return-neutral, cash-like) swap consideration, for the settings panel.
    let neutralSwapYield = null;
    if (perAsset[0]) {
      const { rE, tauOrd } = perAsset[0].inputs;
      if (Number.isFinite(rE) && Number.isFinite(tauOrd) && tauOrd < 1) neutralSwapYield = resolveSwapProfile({ rE, tauOrd }).ySw;
    }
    return { perAsset, ranked, remainingExclusion, neutralSwapYield };
  }, [g, e, s, list]);

  return { ...model, isStale };
}
