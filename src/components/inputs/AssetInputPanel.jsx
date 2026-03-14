import { useMemo } from 'react';

const transferMechanisms = [
  { value: 'gift', label: 'Gift to IDGT', disabled: false },
  { value: 'installment', label: 'Installment Sale to IDGT', disabled: false },
  { value: 'grat', label: 'GRAT (Coming Soon)', disabled: true },
  { value: 'slat', label: 'SLAT (Coming Soon)', disabled: true },
];

export default function AssetInputPanel({ assets, onAssetsChange, swappedInProfile, onSwappedInProfileChange }) {
  const updateAsset = (index, updates) => {
    const updated = assets.map((a, i) => (i === index ? { ...a, ...updates } : a));
    onAssetsChange(updated);
  };

  const addAsset = () => {
    onAssetsChange([
      ...assets,
      {
        name: `Asset ${assets.length + 1}`,
        fmv: 1_000_000,
        discount: 0,
        basis: 200_000,
        growthRate: 0.07,
        incomeYield: 0.02,
        saleYear: 0,
        transferMechanism: 'gift',
        exemptionAlreadyExhausted: false,
      },
    ]);
  };

  const removeAsset = (index) => {
    if (assets.length === 1) return;
    onAssetsChange(assets.filter((_, i) => i !== index));
  };

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">Asset Inputs</h2>
      <div className="space-y-5">
        {assets.map((asset, index) => (
          <div key={index} className="rounded border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-medium">{asset.name}</h3>
              {assets.length > 1 ? (
                <button
                  className="text-sm text-red-600 hover:text-red-800"
                  onClick={() => removeAsset(index)}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Current FMV ($)</label>
                <input
                  type="number"
                  value={asset.fmv}
                  onChange={(e) => updateAsset(index, { fmv: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Valuation Discount (%)</label>
                <input
                  type="number"
                  min={0}
                  max={40}
                  value={asset.discount}
                  onChange={(e) => updateAsset(index, { discount: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
                <p className="text-xs text-slate-500">
                  Lack of marketability or minority interest discount — reduces gifted value for gift tax purposes.
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Cost Basis ($)</label>
                <input
                  type="number"
                  value={asset.basis}
                  onChange={(e) => updateAsset(index, { basis: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
                {asset.basis > asset.fmv ? (
                  <p className="text-xs text-amber-700">Basis exceeds FMV; verify.</p>
                ) : null}
              </div>
              <div>
                <label className="text-sm font-medium">Annual Appreciation Rate (%)</label>
                <input
                  type="number"
                  value={asset.growthRate}
                  onChange={(e) => updateAsset(index, { growthRate: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Annual Income Yield (%)</label>
                <input
                  type="number"
                  value={asset.incomeYield}
                  onChange={(e) => updateAsset(index, { incomeYield: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Sale Year in IDGT (0 = never)</label>
                <input
                  type="number"
                  value={asset.saleYear}
                  onChange={(e) => updateAsset(index, { saleYear: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Transfer Mechanism</label>
                <select
                  value={asset.transferMechanism}
                  onChange={(e) => updateAsset(index, { transferMechanism: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                >
                  {transferMechanisms.map((option) => (
                    <option key={option.value} value={option.value} disabled={option.disabled}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={asset.exemptionAlreadyExhausted}
                    onChange={(e) => updateAsset(index, { exemptionAlreadyExhausted: e.target.checked })}
                  />
                  Exemption Already Exhausted
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded border border-slate-200 bg-white p-4">
        <h3 className="text-lg font-semibold">Swapped-In Asset Profile</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Initial Basis (% of swap value)</label>
            <input
              type="number"
              value={swappedInProfile.basisPct}
              onChange={(e) => onSwappedInProfileChange({
                ...swappedInProfile,
                basisPct: Number(e.target.value),
              })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Growth Rate (%)</label>
            <input
              type="number"
              value={swappedInProfile.growthRate}
              onChange={(e) => onSwappedInProfileChange({
                ...swappedInProfile,
                growthRate: Number(e.target.value),
              })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Income Yield (%)</label>
            <input
              type="number"
              value={swappedInProfile.incomeYield}
              onChange={(e) => onSwappedInProfileChange({
                ...swappedInProfile,
                incomeYield: Number(e.target.value),
              })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Grantor Ordinary Income Tax Rate (%)</label>
            <input
              type="number"
              value={swappedInProfile.grantorOrdIncomeTaxRate}
              onChange={(e) => onSwappedInProfileChange({
                ...swappedInProfile,
                grantorOrdIncomeTaxRate: Number(e.target.value),
              })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Grantor LTCG Tax Rate (%)</label>
            <input
              type="number"
              value={swappedInProfile.grantorLtcgTaxRate}
              onChange={(e) => onSwappedInProfileChange({
                ...swappedInProfile,
                grantorLtcgTaxRate: Number(e.target.value),
              })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
        </div>
      </div>
      <button
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        onClick={addAsset}
      >
        Add Asset
      </button>
    </section>
  );
}
