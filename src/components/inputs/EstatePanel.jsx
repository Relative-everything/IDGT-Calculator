import Card from '../ui/Card.jsx';
import NumberField from '../ui/NumberField.jsx';
import SelectField from '../ui/SelectField.jsx';
import Toggle from '../ui/Toggle.jsx';
import { BASIC_EXCLUSION_BY_YEAR, CURRENT_GIFT_YEAR } from '../../data/exclusionAmounts.js';
import { fmtMoney } from '../format.js';

const YEAR_OPTIONS = Object.keys(BASIC_EXCLUSION_BY_YEAR).map(Number).filter((y) => y < CURRENT_GIFT_YEAR).sort((a, b) => b - a)
  .map((y) => ({ value: String(y), label: `${y} (${fmtMoney(BASIC_EXCLUSION_BY_YEAR[y])})` }));

export default function EstatePanel({ estate, onChange, errors }) {
  const set = (field) => (value) => onChange({ ...estate, [field]: value });
  const err = (f) => errors?.[f];
  const exhaustPrior = () => {
    const year = estate.priorGiftYear;
    const amt = BASIC_EXCLUSION_BY_YEAR[Number(year)];
    onChange({ ...estate, priorGifts: String(amt ?? ''), priorExclusionMode: 'year' });
  };
  return (
    <Card title="Estate & transfer tax" subtitle="Everything outside the candidate asset, and the federal transfer-tax parameters.">
      <div className="grid grid-cols-2 gap-3">
        <NumberField id="otherEstate" label="Other estate (excl. this asset)" value={estate.otherEstate} onChange={set('otherEstate')} prefix="$" error={err('E0')}
          tip="Grantor's estate before the gift, excluding the candidate asset. Pays the income tax on trust income, any gift tax, and the swap consideration." />
        <NumberField id="otherEstateGrowth" label="Other-estate growth (after tax)" value={estate.otherEstateGrowth} onChange={set('otherEstateGrowth')} suffix="%" error={err('rE')}
          tip="Annual after-tax growth of the rest of the estate. The default swap consideration is calibrated to earn this rate after tax (return-neutral)." />
        <NumberField id="exclusion" label={`Basic exclusion (${CURRENT_GIFT_YEAR})`} value={estate.exclusion} onChange={set('exclusion')} prefix="$" error={err('X0')}
          tip="IRC §2010(c)(3) as amended by OBBBA §70106: $15,000,000 for 2026, indexed after 2026. Edit for a legislative scenario." />
        <NumberField id="exclusionIndexing" label="Exclusion indexing" value={estate.exclusionIndexing} onChange={set('exclusionIndexing')} suffix="%/yr" error={err('pi')}
          tip="Projected annual increase from 2027. The 2026 amount is fixed by statute." />
        <NumberField id="estateTaxRate" label="Estate / gift tax rate" value={estate.estateTaxRate} onChange={set('estateTaxRate')} suffix="%" error={err('tauE')}
          tip="IRC §2001(c) is flat at 40% above $1,000,000; the unified credit absorbs everything below the exclusion." />
        <NumberField id="discountRate" label="Discount rate" value={estate.discountRate} onChange={set('discountRate')} suffix="%" error={err('d')}
          tip="Rate used to bring each death-year outcome to present value." />
      </div>

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Prior taxable gifts</h3>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <NumberField id="priorGifts" label="Prior taxable gifts (total)" value={estate.priorGifts} onChange={set('priorGifts')} prefix="$" error={err('P')}
          tip="Adjusted taxable gifts already made. They are measured against the exclusion of the year they were made (§2001(g)(2)), so a donor who used up the 2025 exclusion still has $1,010,000 of 2026 exclusion." />
        {estate.priorExclusionMode === 'custom' ? (
          <NumberField id="priorGiftExclusion" label="Exclusion when made" value={estate.priorGiftExclusion} onChange={set('priorGiftExclusion')} prefix="$" error={err('XP')} />
        ) : (
          <SelectField id="priorGiftYear" label="Year of prior gifts" value={estate.priorGiftYear} onChange={set('priorGiftYear')} options={YEAR_OPTIONS} />
        )}
        <div className="col-span-2 flex flex-wrap items-center gap-3 text-xs">
          <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={exhaustPrior}>
            Set to “exclusion fully used in {estate.priorGiftYear}”
          </button>
          <button type="button" className="text-ink-2 underline-offset-2 hover:underline"
            onClick={() => set('priorExclusionMode')(estate.priorExclusionMode === 'custom' ? 'year' : 'custom')}>
            {estate.priorExclusionMode === 'custom' ? 'Pick a year instead' : 'Enter the exclusion amount manually'}
          </button>
        </div>
      </div>

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Heirs</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumberField id="beneFedLtcg" label="Federal LTCG" value={estate.beneFedLtcg} onChange={set('beneFedLtcg')} suffix="%" error={err('tauBene')} />
        <NumberField id="beneStateLtcg" label="State LTCG" value={estate.beneStateLtcg} onChange={set('beneStateLtcg')} suffix="%" />
        <NumberField id="yearsToSale" label="Years after death until sale" value={estate.yearsToSale} onChange={set('yearsToSale')} suffix="yrs" error={err('k')}
          tip="Heirs' capital-gains tax on un-stepped-up gain is paid this many years after death." />
        <Toggle id="beneNiit" className="col-span-2 sm:col-span-3" label="Add NIIT to the heirs' rate" checked={estate.beneNiit} onChange={set('beneNiit')}
          hint="A non-grantor trust after death hits the 3.8% surtax above ~$16,000 of undistributed NII; turn off only if gains will be distributed to heirs below the §1411 thresholds." />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <NumberField id="maxYears" label="Table display horizon" value={estate.maxYears} onChange={set('maxYears')} suffix="yrs"
          tip="Truncates the per-year table only. NPV always runs to the end of the life table." />
      </div>
    </Card>
  );
}
