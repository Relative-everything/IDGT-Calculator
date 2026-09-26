import NumberField from '../ui/NumberField.jsx';
import Toggle from '../ui/Toggle.jsx';
import { fmtPct } from '../format.js';

/** Consideration the grantor substitutes for the asset when the swap power is exercised. */
export default function SwapProfilePanel({ settings, onChange, errors, neutralYield }) {
  const set = (field) => (value) => onChange({ ...settings, [field]: value });
  const err = (f) => errors?.[f];
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Swap consideration</h3>
      <p className="mt-1 text-xs text-muted">
        Default: cash-like — basis 100%, no appreciation, gross yield {neutralYield != null ? fmtPct(neutralYield, 2) : '—'} taxed to the grantor, so it earns the other-estate rate after tax (return-neutral).
      </p>
      <Toggle id="swapCustom" className="mt-2" label="Customise the consideration" checked={settings.swapCustom} onChange={set('swapCustom')}
        tip="Any profile whose after-tax return differs from the other-estate growth books a residual that is not a tax benefit; the results flag it." />
      {settings.swapCustom && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <NumberField id="swapBasisPct" label="Basis (% of value)" value={settings.swapBasisPct} onChange={set('swapBasisPct')} suffix="%" error={err('swapBasisPct') ?? err('bSw')} />
          <NumberField id="swapGrowth" label="Appreciation" value={settings.swapGrowth} onChange={set('swapGrowth')} suffix="%" error={err('swapGrowth') ?? err('gSw')} />
          <NumberField id="swapYield" label="Gross yield" value={settings.swapYield} onChange={set('swapYield')} suffix="%" error={err('swapYield') ?? err('ySw')} />
          <NumberField id="swapTaxRate" label="Grantor rate on its yield" value={settings.swapTaxRate} onChange={set('swapTaxRate')} suffix="%" error={err('swapTaxRate') ?? err('tauSw')} />
        </div>
      )}
    </div>
  );
}
