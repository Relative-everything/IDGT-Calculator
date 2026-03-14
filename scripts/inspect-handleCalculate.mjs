import { calculateNPV_Gift, calculateNPV_InstallmentSale } from '../src/engine/index.js';

const grantor = {
  age: 65,
  gender: 'male',
  fedOrdIncomeTaxRate: 37,
  fedLtcgTaxRate: 20,
  stateOrdIncomeTaxRate: 5,
  stateLtcgTaxRate: 5,
  niitRate: 3.8,
  state: 'NY',
};

const assumptions = {
  discountRate: 4,
  taxInflationRate: 2,
  totalGrantorEstate: 10_000_000,
  federalEstateExemption: 13_610_000,
  tcjaSunset: false,
  beneficiaryFedLtcg: 20,
  beneficiaryStateLtcg: 5,
  yearsPostDeath: 1,
  maxYears: 35,
  stateEstateTaxRate: 0,
  stateEstateExemption: 0,
  stateEstateCliffThreshold: 0,
  stateEstateCliffMultiplier: 1.05,
};

const assets = [
  {
    name: 'Asset 1',
    fmv: 1_000_000,
    discount: 0,
    basis: 200_000,
    growthRate: 0.07,
    incomeYield: 0.02,
    saleYear: 0,
    transferMechanism: 'gift',
    exemptionAlreadyExhausted: false,
  },
];

function runCalculation() {
  const skipped = [];
  const output = [];

  try {
    const mapped = assets
      .map((asset) => {
        console.log('Processing asset:', asset.name, asset);
        try {
          const baseParams = {
            assetFMV: asset.fmv,
            costBasis: asset.basis,
            annualGrowthRate: asset.growthRate,
            annualIncomeYield: asset.incomeYield,
            saleYearInIDGT: asset.saleYear,
            valuationDiscountPct: asset.discount,
            grantorAge: grantor.age,
            grantorGender: grantor.gender,
            discountRate: assumptions.discountRate / 100,
            taxProvisionInflationRate: assumptions.taxInflationRate / 100,
            totalGrantorEstate: assumptions.totalGrantorEstate,
            federalEstateExemption: assumptions.federalEstateExemption,
            federalEstateTaxRate: 0.4,
            grantorFedOrdIncomeTaxRate: grantor.fedOrdIncomeTaxRate / 100,
            grantorFedLtcgTaxRate: grantor.fedLtcgTaxRate / 100,
            grantorStateOrdIncomeTaxRate: grantor.stateOrdIncomeTaxRate / 100,
            grantorStateLtcgTaxRate: grantor.stateLtcgTaxRate / 100,
            grantorNIITRate: grantor.niitRate / 100,
            beneficiaryFedLtcg: assumptions.beneficiaryFedLtcg / 100,
            beneficiaryStateLtcg: assumptions.beneficiaryStateLtcg / 100,
            yearsPostDeathToSale: assumptions.yearsPostDeath,
            maxProjectionYears: assumptions.maxYears,
            state: grantor.state,
            returnAnnualDetail: true,
          };

          if (asset.transferMechanism === 'grat' || asset.transferMechanism === 'slat') {
            skipped.push(asset.name);
            return null;
          }

          if (asset.transferMechanism === 'installment') {
            const result = calculateNPV_InstallmentSale({
              ...baseParams,
              noteRate: 0.05,
              noteTerm: 10,
              section7520Rate: 0.05,
              grantor: {
                fedOrdIncomeTaxRate: grantor.fedOrdIncomeTaxRate / 100,
                fedLtcgTaxRate: grantor.fedLtcgTaxRate / 100,
                niitRate: grantor.niitRate / 100,
              },
            });

            return {
              assetName: asset.name,
              transferMechanism: 'Installment Sale',
              assetValue: asset.fmv,
              ...result,
            };
          }

          const result = calculateNPV_Gift({
            ...baseParams,
            maxYears: assumptions.maxYears,
          });

          return {
            assetName: asset.name,
            transferMechanism: 'Gift',
            assetValue: asset.fmv,
            ...result,
          };
        } catch (assetError) {
          console.error('Asset failed:', asset.name, assetError?.message, assetError?.stack);
          console.error(`Asset "${asset?.name ?? 'unknown'}" error:`, assetError);
          return null;
        }
      })
      .filter(Boolean);

    output.push(...mapped);
  } catch (error) {
    console.error('Asset failed:', error?.message, error?.stack);
    console.error('Unexpected calculation error:', error);
  } finally {
    console.log('Results array:', output);
  }
}

runCalculation();
