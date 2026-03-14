import { useMemo, useRef, useState } from 'react'
import AppShell from './components/layout/AppShell'
import GrantorInputPanel from './components/inputs/GrantorInputPanel'
import AssetInputPanel from './components/inputs/AssetInputPanel'
import EconomicAssumptionsPanel from './components/inputs/EconomicAssumptionsPanel'
import GiftDeathComparisonPanel from './components/inputs/GiftDeathComparisonPanel'
import ResultsTable from './components/results/ResultsTable'
import ProjectionsTable from './components/results/ProjectionsTable'
import {
  calculateNPV_Gift,
  calculateNPV_InstallmentSale,
  calculateGiftVsDeathComparison,
} from './engine'

const DEFAULT_GRANTOR = {
  age: 65,
  gender: 'male',
  fedOrdIncomeTaxRate: 37,
  fedLtcgTaxRate: 20,
  stateOrdIncomeTaxRate: 5,
  stateLtcgTaxRate: 5,
  niitRate: 3.8,
  state: 'NY',
}

const DEFAULT_ASSET = {
  name: 'Asset 1',
  fmv: 1_000_000,
  discount: 0,
  basis: 200_000,
  growthRate: 0.07,
  incomeYield: 0.02,
  saleYear: 0,
  transferMechanism: 'gift',
  exemptionAlreadyExhausted: false,
}

const DEFAULT_ASSUMPTIONS = {
  discountRate: 4,
  taxInflationRate: 2,
  totalGrantorEstate: 10_000_000,
  federalEstateTaxRate: 40,
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
}

const DEFAULT_SWAP_PROFILE = {
  basisPct: 1.0,
  growthRate: 0.04,
  incomeYield: 0.0,
  grantorOrdIncomeTaxRate: 0.0,
  grantorLtcgTaxRate: 0.0,
}

export default function App() {
  const [grantor, setGrantor] = useState(DEFAULT_GRANTOR)
  const [assets, setAssets] = useState([DEFAULT_ASSET])
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS)
  const [swappedInProfile, setSwappedInProfile] = useState(DEFAULT_SWAP_PROFILE)
  const [results, setResults] = useState([])
  const [isCalculating, setIsCalculating] = useState(false)
  const [activeTab, setActiveTab] = useState('Asset Inputs')
  const [selectedAssetIndex, setSelectedAssetIndex] = useState(0)

  const calculatedAt = useMemo(() => new Date().toLocaleString(), [results])

  const handleAssumptionsChange = (updated) => {
    if (updated.tcjaSunset) {
      updated = { ...updated, federalEstateExemption: 7_000_000 }
    }
    setAssumptions(updated)
  }

  const resultsRef = useRef(null)
  const [hasCalculated, setHasCalculated] = useState(false)

  const handleCalculate = () => {
    setIsCalculating(true)

    // Delay to ensure "Calculating..." renders before heavy computation
    setTimeout(() => {
      const skipped = []
      const output = []

      try {
        const mapped = assets
          .map((asset) => {
            try {
              const baseParams = {
                assetFMV: asset.fmv,
                costBasis: asset.basis,
                annualGrowthRate: asset.growthRate,
                annualIncomeYield: asset.incomeYield,
                saleYearInIDGT: asset.saleYear,
                valuationDiscountPct: asset.discount,
                grantorAge: grantor.age,
                gender: grantor.gender.toLowerCase(),
                discountRate: assumptions.discountRate / 100,
                taxProvisionInflationRate: assumptions.taxInflationRate / 100,
                totalGrantorEstate: assumptions.totalGrantorEstate,
                federalEstateExemption: assumptions.federalEstateExemption,
                federalEstateTaxRate: assumptions.federalEstateTaxRate / 100,
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
              }

              if (asset.transferMechanism === 'grat' || asset.transferMechanism === 'slat') {
                skipped.push(asset.name)
                return null
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
                })

                return {
                  assetName: asset.name,
                  transferMechanism: 'Installment Sale',
                  assetValue: asset.fmv,
                  ...result,
                }
              }

              const result = calculateNPV_Gift({
                ...baseParams,
                maxYears: assumptions.maxYears,
              })

              return {
                assetName: asset.name,
                transferMechanism: 'Gift',
                assetValue: asset.fmv,
                ...result,
              }
            } catch (assetError) {
              console.error('Asset failed:', asset.name, assetError?.message, assetError?.stack)
              console.error(`Asset "${asset?.name ?? 'unknown'}" error:`, assetError)
              return null
            }
          })
          .filter(Boolean)

        output.push(...mapped)
      } catch (error) {
        console.error('Asset failed:', error?.message, error?.stack)
        console.error('Unexpected calculation error:', error)
      } finally {
        setResults(output)
        setHasCalculated(true)
        setIsCalculating(false)

        if (skipped.length > 0) {
          window.alert(
            `GRAT and SLAT calculations coming in v2 — skipping this asset${
              skipped.length === 1 ? '' : 's'
            }: ${skipped.join(', ')}`
          )
        }

        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 50)
      }
    }, 16)
  }

  const handleGiftDeathComparison = (params) => {
    return calculateGiftVsDeathComparison(params)
  }

  const handleNewScenario = () => {
    setGrantor(DEFAULT_GRANTOR)
    setAssets([DEFAULT_ASSET])
    setAssumptions(DEFAULT_ASSUMPTIONS)
    setSwappedInProfile(DEFAULT_SWAP_PROFILE)
    setResults([])
  }

  const handleExportPDF = () => {
    window.alert('Export to PDF not yet implemented.')
  }

  const handleExportExcel = () => {
    window.alert('Export to Excel not yet implemented.')
  }

  const content = () => {
    switch (activeTab) {
      case 'Asset Inputs':
        return (
          <div className="space-y-6">
            <AssetInputPanel
              assets={assets}
              onAssetsChange={setAssets}
              swappedInProfile={swappedInProfile}
              onSwappedInProfileChange={setSwappedInProfile}
            />
            <EconomicAssumptionsPanel
              assumptions={assumptions}
              onAssumptionsChange={handleAssumptionsChange}
              grantorState={grantor.state}
            />
          </div>
        )
      case 'Transfer Mechanism':
        return (
          <div className="space-y-4" ref={resultsRef}>
            <p className="text-sm text-slate-600">
              Select transfer mechanisms in the Asset Inputs panel, then run calculations.
            </p>
            <button
              className="rounded bg-slate-900 px-4 py-2 text-white"
              onClick={handleCalculate}
              disabled={isCalculating}
            >
              {isCalculating ? 'Calculating...' : 'Calculate'}
            </button>
            <p className="text-xs text-slate-500">Last calculated: {calculatedAt}</p>
            <ResultsTable results={results} calculatedAt={calculatedAt} />
          </div>
        )
      case 'Gift vs. Death Analysis':
        return (
          <GiftDeathComparisonPanel
            assets={assets}
            grantor={grantor}
            assumptions={assumptions}
            onRunComparison={handleGiftDeathComparison}
          />
        )
      case 'Projections':
        return (
          <div className="space-y-4">
            {!hasCalculated ? (
              <div className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-600">
                Run "Calculate" on the Transfer Mechanism tab to generate projections.
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="text-sm font-medium">Select asset</label>
                  <select
                    value={selectedAssetIndex}
                    onChange={(e) => setSelectedAssetIndex(Number(e.target.value))}
                    className="max-w-sm rounded border border-slate-300 px-3 py-2"
                  >
                    {assets.map((asset, idx) => (
                      <option key={idx} value={idx}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                </div>
                <ProjectionsTable
                  asset={assets[selectedAssetIndex]}
                  grantor={grantor}
                  assumptions={assumptions}
                  hasCalculated={hasCalculated}
                />
              </>
            )}
          </div>
        )
      case 'Scenario Compare':
        return <p>Scenario Compare panel coming soon.</p>
      case 'Monte Carlo':
        return <p>Monte Carlo panel coming soon.</p>
      default:
        return null
    }
  }

  return (
    <AppShell
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onNewScenario={handleNewScenario}
      onExportPDF={handleExportPDF}
      onExportExcel={handleExportExcel}
    >
      <div className="max-w-7xl mx-auto">{content()}</div>
    </AppShell>
  )
}
