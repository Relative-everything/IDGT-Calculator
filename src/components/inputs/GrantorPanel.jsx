import Card from '../ui/Card.jsx';
import NumberField from '../ui/NumberField.jsx';
import SelectField from '../ui/SelectField.jsx';
import Toggle from '../ui/Toggle.jsx';
import { LIFE_TABLES } from '../../data/lifeTables/index.js';
import { fmtDecimal } from '../format.js';

const SEX_OPTIONS = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }];
const TABLE_OPTIONS = LIFE_TABLES.map((t) => ({ value: t.id, label: t.label }));

/** One line on what the chosen table implies (numbers from the engine via the hook; formatting only here). */
function MortalityNote({ mortality }) {
  if (!mortality || mortality.deterministic || mortality.grantorYears == null) return null;
  const years = (v) => `${fmtDecimal(v, 1)} yrs`;
  return (
    <p className="col-span-2 text-xs text-ink-2">
      Life expectancy from the table: grantor {years(mortality.grantorYears)}
      {mortality.married && mortality.spouseYears != null && <> · spouse {years(mortality.spouseYears)} · second death {years(mortality.secondDeathYears)}</>}.
      {' '}General-population period rates; UHNW clients typically live longer.
    </p>
  );
}

export default function GrantorPanel({ grantor, onChange, errors, mortality }) {
  const set = (field) => (value) => onChange({ ...grantor, [field]: value });
  const err = (f) => errors?.[f];
  const married = Boolean(grantor.married);
  return (
    <Card title="Grantor" subtitle="Mortality and the income-tax rates paid on trust income (IRC §§671–677).">
      <div className="grid grid-cols-2 gap-3">
        <SelectField id="lifeTable" className="col-span-2" label="Life table" value={grantor.lifeTable} onChange={set('lifeTable')} options={TABLE_OPTIONS} />
        <NumberField id="age" label="Age" value={grantor.age} onChange={set('age')} suffix="yrs" error={err('age')}
          tip="Age at the gift. Drives the death-year probabilities from the chosen life table." />
        <SelectField id="sex" label="Sex (table column)" value={grantor.sex} onChange={set('sex')} options={SEX_OPTIONS} />
        <Toggle id="married" className="col-span-2" label="Married — estate tax at the second death" checked={married} onChange={set('married')}
          tip="Everything passes to the survivor at the first death (marital deduction) and the first spouse's unused exclusion ports to the survivor. The tax burn and the swap power still end at the grantor's own death; after it the trust pays its own income tax." />
        {married && (
          <>
            <NumberField id="spouseAge" label="Spouse's age" value={grantor.spouseAge} onChange={set('spouseAge')} suffix="yrs" error={err('spouseAge') ?? err('ageSpouse')} />
            <SelectField id="spouseSex" label="Spouse's sex (table column)" value={grantor.spouseSex} onChange={set('spouseSex')} options={SEX_OPTIONS} />
            <Toggle id="portability" className="col-span-2" label="Elect portability at the first death" checked={grantor.portability !== false} onChange={set('portability')}
              hint="§2010(c)(4): the first spouse's unused exclusion (DSUE) is added to the survivor's. Off: it is lost, and a gift that uses exclusion costs nothing at the first death." />
          </>
        )}
        <Toggle id="useDeathYear" className="col-span-2" label={married ? 'Use assumed death years instead of the life table' : 'Use an assumed death year instead of the life table'}
          checked={grantor.useDeathYear} onChange={set('useDeathYear')}
          tip="Deterministic mode: death at the end of the chosen year with probability 1. Independent of the life table." />
        {grantor.useDeathYear && (
          <>
            <NumberField id="deathYear" label={married ? 'Grantor dies at end of year' : 'Death at end of year'} value={grantor.deathYear} onChange={set('deathYear')} suffix="yr"
              error={err('deathYear') ?? err('deathYearOverride')} />
            {married && (
              <NumberField id="spouseDeathYear" label="Spouse dies at end of year" value={grantor.spouseDeathYear} onChange={set('spouseDeathYear')} suffix="yr"
                error={err('spouseDeathYear') ?? err('deathYearOverrideSpouse')} />
            )}
          </>
        )}
        <MortalityNote mortality={mortality} />
      </div>
      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Grantor income-tax rates</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumberField id="fedOrd" label="Federal ordinary" value={grantor.fedOrd} onChange={set('fedOrd')} suffix="%" error={err('fedOrd') ?? err('tauOrd')} />
        <NumberField id="stateOrd" label="State ordinary" value={grantor.stateOrd} onChange={set('stateOrd')} suffix="%" error={err('stateOrd')} />
        <NumberField id="niit" label="NIIT" value={grantor.niit} onChange={set('niit')} suffix="%" error={err('niit')} tip="IRC §1411, 3.8% on net investment income. Applied to trust income taxed to the grantor." />
        <NumberField id="fedLtcg" label="Federal LTCG" value={grantor.fedLtcg} onChange={set('fedLtcg')} suffix="%" error={err('fedLtcg') ?? err('tauCg')} />
        <NumberField id="stateLtcg" label="State LTCG" value={grantor.stateLtcg} onChange={set('stateLtcg')} suffix="%" error={err('stateLtcg')} />
      </div>
      <p className="mt-2 text-xs text-muted">Ordinary stack applies to the yield; the capital-gain stack applies to a sale inside the trust (Rev. Rul. 85-13: the grantor is the taxpayer).{married && ' After the grantor dies, the survivor and the trust pay at the same rates.'}</p>
    </Card>
  );
}
