// State → engine → results. The only place the UI calls the engine; the pipeline itself is the pure computeModel.
import { useDeferredValue, useMemo } from 'react';
import { computeModel } from './computeModel.js';

/**
 * @returns {{ perAsset: object[], ranked: object[], remainingExclusion: number|null, neutralSwapYield: number|null,
 *   neutralSwap: object|null, swapRates: { rE:number, tauOrd:number }|null, isStale: boolean,
 *   snapshot: { grantor:object, estate:object, settings:object, assets:object[] } }}
 */
export function useIdgtModel({ grantor, estate, settings, assets }) {
  // Defer each part separately so an unrelated re-render (row selection, a notice) does not recompute.
  const g = useDeferredValue(grantor);
  const e = useDeferredValue(estate);
  const s = useDeferredValue(settings);
  const list = useDeferredValue(assets);
  const isStale = g !== grantor || e !== estate || s !== settings || list !== assets;

  const model = useMemo(() => computeModel({ grantor: g, estate: e, settings: s, assets: list }), [g, e, s, list]);
  // The inputs these results were computed from, for views that show inputs next to results (the inputs audit): one
  // snapshot, so a value and the flag computed from it can never disagree while the deferred run catches up.
  const snapshot = useMemo(() => ({ grantor: g, estate: e, settings: s, assets: list }), [g, e, s, list]);

  return { ...model, isStale, snapshot };
}
