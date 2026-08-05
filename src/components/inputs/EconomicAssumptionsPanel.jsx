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
          <label className="text-sm font-medium">Federal Estate Tax Rate (%)</label>
          <input
            type="number"
            value={assumptions.federalEstateTaxRate}
            onChange={(e) => update('federalEstateTaxRate', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Federal Estate Tax Exemption ($)</label>
          <input
            type="number"
            value={assumptions.federalEstateExemption}
            onChange={(e) => update('federalEstateExemption', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
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
