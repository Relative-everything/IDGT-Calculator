// Selected asset → ING breakevens and grid (docs/changes/2026-09-27-ing-comparison/model.md §6–§7).
// State wiring only: the engine does every calculation. The three breakevens and the grid re-run the full swap
// search 100+ times (≈ 0.1–0.8 s, plan.md), so they are computed after paint, debounced, for the selected
// asset only — typing never waits on them, and the previous result stays on screen (dimmed) until the new one lands.
import { useEffect, useMemo, useState } from 'react';
import { breakevens, comparisonGrid } from '../engine/breakeven.js';

/** Quiet period after the last input change before the breakevens are recomputed (UI timing, not a model value). */
export const BREAKEVEN_DEBOUNCE_MS = 250;

/**
 * @param {object|null} entry - a ranked/per-asset entry from useIdgtModel ({ inputs, result, ing })
 * @returns {{ breakevens: object|null, grid: object|null, isStale: boolean, error: string|null }}
 */
export function useIngBreakeven(entry) {
  const inputs = entry?.result && entry?.ing ? entry.inputs : null;
  // A value key, so re-evaluating an unrelated asset (new object, same numbers) does not restart the solve.
  const key = useMemo(() => (inputs ? JSON.stringify(inputs) : null), [inputs]);
  const [done, setDone] = useState({ key: null, breakevens: null, grid: null, error: null });

  useEffect(() => {
    if (!key) return undefined;
    const handle = setTimeout(() => {
      try {
        setDone({ key, breakevens: breakevens(inputs), grid: comparisonGrid(inputs), error: null });
      } catch (err) {
        setDone({ key, breakevens: null, grid: null, error: err.message });
      }
    }, BREAKEVEN_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [key, inputs]);

  if (!key) return { breakevens: null, grid: null, isStale: false, error: null };
  return { breakevens: done.breakevens, grid: done.grid, isStale: done.key !== key, error: done.key === key ? done.error : null };
}
