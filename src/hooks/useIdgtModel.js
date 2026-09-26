// State → engine → results. The only place the UI calls the engine.
import { useDeferredValue, useMemo } from 'react';
import { evaluateAsset, resolveSwapProfile } from '../engine/idgtModel.js';
import { validateInputs } from '../engine/validate.js';
import { rankAssets } from '../engine/ranking.js';
import { buildEngineInputs, FIELD_LABELS } from './buildInputs.js';

/**
 * @returns {{ perAsset: object[], ranked: object[], remainingExclusion: number|null, neutralSwapYieldPct: string|null, isStale: boolean }}
 */
export function useIdgtModel({ grantor, estate, settings, assets }) {
  const deferred = useDeferredValue({ grantor, estate, settings, assets });
  const isStale = deferred.grantor !== grantor || deferred.estate !== estate
    || deferred.settings !== settings || deferred.assets !== assets;

  const model = useMemo(() => {
    const { grantor: g, estate: e, settings: s, assets: list } = deferred;
    const perAsset = list.map((asset) => {
      const inputs = buildEngineInputs({ grantor: g, estate: e, settings: s, asset });
      const { errors, warnings } = validateInputs(inputs);
      const labelled = errors.map((x) => ({ ...x, label: FIELD_LABELS[x.field] ?? x.field }));
      if (labelled.length) return { id: asset.id, name: asset.name, inputs, errors: labelled, warnings, result: null };
      try {
        const result = evaluateAsset(inputs);
        return { id: asset.id, name: asset.name, inputs, errors: [], warnings: result.warnings, result };
      } catch (err) {
        return { id: asset.id, name: asset.name, inputs, errors: [{ field: 'engine', label: 'Model', message: err.message }], warnings, result: null };
      }
    });
    const ok = perAsset.filter((a) => a.result);
    const remainingExclusion = ok.length ? ok[0].result.derived.R : null;
    const ranked = rankAssets(ok, { key: s.rankKey === 'none' ? 'none' : 'opt', remainingExclusion: remainingExclusion ?? Infinity });
    // Gross yield of the default (return-neutral, cash-like) swap consideration, for the settings panel.
    let neutralSwapYieldPct = null;
    if (perAsset[0]) {
      const { rE, tauOrd } = perAsset[0].inputs;
      if (Number.isFinite(rE) && Number.isFinite(tauOrd) && tauOrd < 1) {
        neutralSwapYieldPct = (resolveSwapProfile({ rE, tauOrd }).ySw * 100).toFixed(2);
      }
    }
    return { perAsset, ranked, remainingExclusion, neutralSwapYieldPct };
  }, [deferred]);

  return { ...model, isStale };
}
