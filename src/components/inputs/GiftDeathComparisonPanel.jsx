import { useMemo, useState } from 'react';

function formatCurrency(value) {
  return `$${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function GiftDeathComparisonPanel({ assets, grantor, assumptions, onRunComparison }) {
  const [yearsUntilDeath, setYearsUntilDeath] = useState(Math.max(1, 85 - grantor.age));
  const [stateCliffEnabled, setStateCliffEnabled] = useState(false);
  const [results, setResults] = useState(null);

  const candidates = useMemo(
    () => assets.filter((a) => a.exemptionAlreadyExhausted),
    [assets]
  );

  const run = () => {
    const res = candidates.map((asset) => {
      const params = {
        assetFMV: asset.fmv,
        annualGrowthRate: asset.growthRate,
        yearsUntilDeath,
        federalGiftTaxRate: 0.4,
        federalEstateTaxRate: 0.4,
        state: grantor.state,
        stateGiftTaxRate: 0,
        stateEstateCliffEnabled: stateCliffEnabled,
        stateEstateCliffThreshold: assumptions.stateEstateCliffThreshold || 0,
        stateEstateCliffMultiplier: assumptions.stateEstateCliffMultiplier || 1.05,
        discountRate: assumptions.discountRate / 100,
        exemptionAlreadyExhausted: asset.exemptionAlreadyExhausted,
        giftTax3YearRuleRisk: true,
      };
      return { assetName: asset.name, result: onRunComparison(params) };
    });
    setResults(res);
  };

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">Gift vs. Death Analysis</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Years Until Death</label>
          <input
            type="number"
            value={yearsUntilDeath}
            onChange={(e) => setYearsUntilDeath(Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={stateCliffEnabled}
              onChange={(e) => setStateCliffEnabled(e.target.checked)}
            />
            State Estate Tax Cliff Rule Enabled
          </label>
        </div>
      </div>

      <button
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        onClick={run}
      >
        Run Gift vs. Death Analysis
      </button>

      {candidates.length === 0 ? (
        <div className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Check "Exemption Already Exhausted" on any asset in Asset Inputs to analyze gift-now vs. hold-until-death tradeoffs.
        </div>
      ) : null}

      {results ? (
        <div className="space-y-6">
          {results.map(({ assetName, result }) => {
            const rec = result.comparison.recommendation;
            const showWarning = result.comparison.warnings.includes('Gift tax paid within 3 years');
            return (
              <div
                key={assetName}
                className="rounded border border-slate-200 bg-white p-4 shadow-sm"
              >
                <h3 className="text-lg font-semibold">{assetName}</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-500">Gift Now</div>
                    <div className="mt-1 text-sm text-slate-800">Gift Tax: {formatCurrency(result.giftNowScenario.giftTaxPaidNow)}</div>
                    <div className="mt-1 text-sm text-slate-800">Net to Heirs: {formatCurrency(result.giftNowScenario.netToHeirs)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500">Hold Until Death</div>
                    <div className="mt-1 text-sm text-slate-800">Estate Tax at Death: {formatCurrency(result.holdUntilDeathScenario.federalEstateTaxAtDeath + result.holdUntilDeathScenario.stateEstateTaxAtDeath)}</div>
                    <div className="mt-1 text-sm text-slate-800">Net to Heirs: {formatCurrency(result.holdUntilDeathScenario.netToHeirs)}</div>
                    <div className="mt-1 text-sm text-slate-800">(includes step-up benefit)</div>
                  </div>
                </div>
                <div className="mt-4 text-sm">
                  <div className="font-semibold">Additional wealth to heirs by gifting now:</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {formatCurrency(result.comparison.additionalHeirWealthIfGiftNow)}
                  </div>
                  <div className="mt-2">Recommendation: <span className="font-semibold">{rec}</span></div>
                  {showWarning ? (
                    <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      ⚠ IRC §2035(b): Gift taxes paid within 3 years of death are includible in taxable estate
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
