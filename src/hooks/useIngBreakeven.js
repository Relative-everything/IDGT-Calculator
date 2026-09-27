// Selected asset → ING breakevens and grid (docs/changes/2026-09-27-ing-comparison/model.md §6–§7).
// State wiring only: the engine does every calculation. The breakevens and the grid re-run the full swap search 100+
// times (≈ 0.5 s for one life, 1–3 s for a married couple), so they run in a Web Worker after a quiet period, for the
// selected asset only; a newer request terminates a running one. The previous result stays on screen (dimmed) until the
// new one lands. Where workers are unavailable the same computation runs on the main thread after the debounce.
import { useEffect, useMemo, useRef, useState } from 'react';
import { breakevens, comparisonGrid } from '../engine/breakeven.js';

/** Quiet period after the last input change before the breakevens are recomputed (UI timing, not a model value). */
export const BREAKEVEN_DEBOUNCE_MS = 250;

const canUseWorker = () => typeof Worker !== 'undefined';

/**
 * @param {object|null} entry - a ranked/per-asset entry from useIdgtModel ({ inputs, result, ing })
 * @returns {{ breakevens: object|null, grid: object|null, isStale: boolean, error: string|null }}
 */
export function useIngBreakeven(entry) {
  const inputs = entry?.result && entry?.ing ? entry.inputs : null;
  // A value key, so re-evaluating an unrelated asset (new object, same numbers) does not restart the solve.
  const key = useMemo(() => (inputs ? JSON.stringify(inputs) : null), [inputs]);
  const [done, setDone] = useState({ key: null, breakevens: null, grid: null, error: null });
  const worker = useRef(null);
  const busy = useRef(false);
  const pendingKey = useRef(null);

  useEffect(() => () => { worker.current?.terminate(); worker.current = null; }, []);

  useEffect(() => {
    if (!key) return undefined;
    const handle = setTimeout(() => {
      if (!canUseWorker()) {
        try {
          setDone({ key, breakevens: breakevens(inputs), grid: comparisonGrid(inputs), error: null });
        } catch (err) {
          setDone({ key, breakevens: null, grid: null, error: err.message });
        }
        return;
      }
      if (busy.current && worker.current) { worker.current.terminate(); worker.current = null; } // superseded
      if (!worker.current) {
        worker.current = new Worker(new URL('./breakeven.worker.js', import.meta.url), { type: 'module' });
        worker.current.onmessage = (event) => { busy.current = false; setDone(event.data); };
        worker.current.onerror = (event) => {
          busy.current = false;
          setDone({ key: pendingKey.current, breakevens: null, grid: null, error: event.message || 'The breakeven worker failed.' });
        };
      }
      busy.current = true;
      pendingKey.current = key;
      worker.current.postMessage({ key, inputs });
    }, BREAKEVEN_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [key, inputs]);

  if (!key) return { breakevens: null, grid: null, isStale: false, error: null };
  return { breakevens: done.breakevens, grid: done.grid, isStale: done.key !== key, error: done.key === key ? done.error : null };
}
