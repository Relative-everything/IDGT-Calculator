// Web Worker: the ING breakevens and grid (docs/changes/2026-09-27-ing-comparison/model.md §6–§7) re-run the full swap
// search 100+ times — about 0.5 s for a single life and 1–3 s for a married couple — so they run off the main thread.
// State wiring only: the engine does every calculation.
import { breakevens, comparisonGrid } from '../engine/breakeven.js';

self.onmessage = (event) => {
  const { key, inputs } = event.data;
  try {
    self.postMessage({ key, breakevens: breakevens(inputs), grid: comparisonGrid(inputs), error: null });
  } catch (err) {
    self.postMessage({ key, breakevens: null, grid: null, error: err.message });
  }
};
