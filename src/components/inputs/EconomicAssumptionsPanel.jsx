import { useMemo } from 'react';
import { STATE_ESTATE_TAX } from '../../data/stateEstateTax';

export default function EconomicAssumptionsPanel({ assumptions, onAssumptionsChange, grantorState }) {
  const update = (field, value) => {
    onAssumptionsChange({ ...assumptions, [field]: value });
  };

  const stateInfo = useMemo(() => {
    if (!grantorState) return null;
    return STATE_ESTATE_TAX[grantorState] || null;
  }, [grantorState]);

  const exemptionDisplay = assumptions.tcjaSunset
    ? 7_000_000
    : assumptions.federalEstateExemption;

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">Economic Assumptions</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Discount Rate (%)</label>
          <input
            type="number"
            value={assumptions.discountRate}
            onChange={(e) => update('discountRate', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Tax Provision Inflation Rate (%)</label>
          <input
            type="number"
            value={assumptions.taxInflationRate}
            onChange={(e) => update('taxInflationRate', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Total Grantor Estate (excluding IDGT assets)</label>
          <input
            type="number"
            value={assumptions.totalGrantorEstate}
            onChange={(e) => update('totalGrantorEstate', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Federal Estate Tax Exemption ($)</label>
          <input
            type="number"
            value={exemptionDisplay}
            onChange={(e) => update('federalEstateExemption', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            disabled={assumptions.tcjaSunset}
          />
        </div>
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={assumptions.tcjaSunset}
              onChange={(e) => update('tcjaSunset', e.target.checked)}
            />
            TCJA Sunset (use $7M exemption post-2025)
          </label>
          {assumptions.tcjaSunset ? (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              TCJA Sunset active — federal exemption reduced to ~$7M post-2025 per §2010(c)(3).
            </div>
          ) : null}
        </div>
        <div>
          <label className="text-sm font-medium">Beneficiary Federal LTCG Rate (%)</label>
          <input
            type="number"
            value={assumptions.beneficiaryFedLtcg}
            onChange={(e) => update('beneficiaryFedLtcg', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Beneficiary State LTCG Rate (%)</label>
          <input
            type="number"
            value={assumptions.beneficiaryStateLtcg}
            onChange={(e) => update('beneficiaryStateLtcg', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Years Post-Death Until Sale</label>
          <input
            type="number"
            value={assumptions.yearsPostDeath}
            onChange={(e) => update('yearsPostDeath', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Max Projection Years</label>
          <input
            type="number"
            value={assumptions.maxYears}
            onChange={(e) => update('maxYears', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
      </div>

      <section className="rounded border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold">State Estate Tax (based on domicile)</h3>
        {stateInfo ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium">State</p>
              <p className="text-sm text-slate-700">{stateInfo.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Exemption</p>
              <p className="text-sm text-slate-700">${stateInfo.exemption.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Top Rate</p>
              <p className="text-sm text-slate-700">{stateInfo.brackets?.slice(-1)[0]?.rate ?? 0}</p>
            </div>
            {stateInfo.note ? (
              <div className="md:col-span-2">
                <p className="text-xs text-slate-500">{stateInfo.note}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-600">Select a domicile with state estate tax in the Grantor panel.</p>
        )}
      </section>
    </section>
  );
}
