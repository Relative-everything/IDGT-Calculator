import { useMemo } from 'react';
import { calculateNPV_Gift, calculateNPV_InstallmentSale } from '../../engine';

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatPercent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

export default function ProjectionsTable({ asset, grantor, assumptions, hasCalculated }) {
  const projection = useMemo(() => {
    if (!asset || !grantor || !assumptions || !hasCalculated) return null;

    const commonParams = {
      assetFMV: asset.fmv,
      costBasis: asset.basis,
      annualGrowthRate: asset.growthRate,
      annualIncomeYield: asset.incomeYield,
      grantorAge: grantor.age,
      gender: grantor.gender?.toLowerCase(),
      discountRate: assumptions.discountRate / 100,
      federalEstateTaxRate: 0.4,
      maxYears: assumptions.maxYears,
      tcjaSunset: assumptions.tcjaSunset,
      state: grantor.state,
      beneficiaryFedLtcg: assumptions.beneficiaryFedLtcg / 100,
      beneficiaryStateLtcg: assumptions.beneficiaryStateLtcg / 100,
      returnAnnualDetail: true,
    };

    if (asset.transferMechanism === 'installment') {
      return calculateNPV_InstallmentSale({
        ...commonParams,
        noteRate: 0.05,
        noteTerm: 10,
        section7520Rate: 0.05,
        grantor: {
          fedOrdIncomeTaxRate: grantor.fedOrdIncomeTaxRate / 100,
          fedLtcgTaxRate: grantor.fedLtcgTaxRate / 100,
          niitRate: grantor.niitRate / 100,
        },
      });
    }

    return calculateNPV_Gift(commonParams);
  }, [asset, grantor, assumptions]);

  if (!projection || !Array.isArray(projection.annualDetail) || projection.annualDetail.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">No projection data available for the selected asset.</p>
      </div>
    );
  }

  const sorted = [...projection.annualDetail];
  const peak = sorted.reduce((best, row) => {
    if (!best || row.pvContributionThisYear > best.pvContributionThisYear) {
      return row;
    }
    return best;
  }, null);

  const summary = projection.annualSummary || {};

  const totalNPV = projection.npv
  const totalPvTaxBurn = projection.pvTaxBurn
  const totalPvEstateTax = projection.pvEstateTax
  const optimalSwapYear = peak?.year ?? null
  const efficiencyRatio = asset?.fmv ? totalNPV / asset.fmv : 0

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Year-by-Year Projections</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Total NPV</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(totalNPV)}</div>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Total PV Tax Burn</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(totalPvTaxBurn)}</div>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Total PV Estate Tax</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(totalPvEstateTax)}</div>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Optimal Swap Year</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{optimalSwapYear ?? 'n/a'}</div>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold text-slate-500">Efficiency Ratio</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{efficiencyRatio.toFixed(2)}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="bg-slate-100 text-left text-sm font-semibold">
              <th className="border px-3 py-2">Year</th>
              <th className="border px-3 py-2">Asset FMV</th>
              <th className="border px-3 py-2">Annual Tax Burn</th>
              <th className="border px-3 py-2">Cumulative Tax Burn</th>
              <th className="border px-3 py-2">Estate Tax Saved (if death)</th>
              <th className="border px-3 py-2">Step-Up Impact (if death)</th>
              <th className="border px-3 py-2">Prob. Death This Year</th>
              <th className="border px-3 py-2">PV Contribution</th>
            </tr>
          </thead>
          <tbody>
            {projection.annualDetail.map((row) => {
              const highlight = peak && row.year === peak.year;
              return (
                <tr key={row.year} className={highlight ? 'bg-emerald-50' : ''}>
                  <td className="border px-3 py-2">{row.year}</td>
                  <td className="border px-3 py-2">{formatCurrency(row.assetFMV)}</td>
                  <td className="border px-3 py-2">{formatCurrency(row.taxBurn)}</td>
                  <td className="border px-3 py-2">{formatCurrency(row.cumulativeTaxBurn)}</td>
                  <td className="border px-3 py-2">{formatCurrency(row.estateTaxSavingsIfDeathThisYear)}</td>
                  <td className="border px-3 py-2">{formatCurrency(row.stepUpImpactIfDeathThisYear)}</td>
                  <td className="border px-3 py-2">{formatPercent(row.probDeathThisYear)}</td>
                  <td className="border px-3 py-2">{formatCurrency(row.pvContributionThisYear)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
