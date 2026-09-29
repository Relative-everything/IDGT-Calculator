// The inputs audit register for the current UI state (pure builder in inputRegister.js), memoised.
import { useMemo } from 'react';
import { buildInputRegister } from './inputRegister.js';

/**
 * @param {{ grantor:object, estate:object, settings:object, assets:object[], perAsset:object[], audit:object }} state
 *   pass the inputs that produced `perAsset` (useIdgtModel's snapshot), so the flags match the values shown
 */
export function useInputRegister({ grantor, estate, settings, assets, perAsset, audit }) {
  return useMemo(
    () => buildInputRegister({ grantor, estate, settings, assets, perAsset, audit }),
    [grantor, estate, settings, assets, perAsset, audit],
  );
}
