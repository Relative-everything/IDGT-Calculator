import Card from '../ui/Card.jsx';
import NumberField from '../ui/NumberField.jsx';
import SelectField from '../ui/SelectField.jsx';
import Toggle from '../ui/Toggle.jsx';

export default function GrantorPanel({ grantor, onChange, errors }) {
  const set = (field) => (value) => onChange({ ...grantor, [field]: value });
  const err = (f) => errors?.[f];
  return (
    <Card title="Grantor" subtitle="Mortality and the income-tax rates paid on trust income (IRC §§671–677).">
      <div className="grid grid-cols-2 gap-3">
        <NumberField id="age" label="Age" value={grantor.age} onChange={set('age')} suffix="yrs" error={err('age')}
          tip="Age at the gift. Drives the death-year probabilities from the SSA period life table." />
        <SelectField id="sex" label="Sex (table column)" value={grantor.sex} onChange={set('sex')}
          options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        <Toggle id="useDeathYear" className="col-span-2" label="Use an assumed death year instead of the mortality table"
          checked={grantor.useDeathYear} onChange={set('useDeathYear')}
          tip="Deterministic mode: the grantor dies at the end of the chosen year with probability 1. Independent of the life table." />
        {grantor.useDeathYear && (
          <NumberField id="deathYear" label="Death at end of year" value={grantor.deathYear} onChange={set('deathYear')} suffix="yr"
            error={err('deathYear') ?? err('deathYearOverride')} />
        )}
      </div>
      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Grantor income-tax rates</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumberField id="fedOrd" label="Federal ordinary" value={grantor.fedOrd} onChange={set('fedOrd')} suffix="%" error={err('fedOrd') ?? err('tauOrd')} />
        <NumberField id="stateOrd" label="State ordinary" value={grantor.stateOrd} onChange={set('stateOrd')} suffix="%" error={err('stateOrd')} />
        <NumberField id="niit" label="NIIT" value={grantor.niit} onChange={set('niit')} suffix="%" error={err('niit')} tip="IRC §1411, 3.8% on net investment income. Applied to trust income taxed to the grantor." />
        <NumberField id="fedLtcg" label="Federal LTCG" value={grantor.fedLtcg} onChange={set('fedLtcg')} suffix="%" error={err('fedLtcg') ?? err('tauCg')} />
        <NumberField id="stateLtcg" label="State LTCG" value={grantor.stateLtcg} onChange={set('stateLtcg')} suffix="%" error={err('stateLtcg')} />
      </div>
      <p className="mt-2 text-xs text-muted">Ordinary stack applies to the yield; the capital-gain stack applies to a sale inside the trust (Rev. Rul. 85-13: the grantor is the taxpayer).</p>
    </Card>
  );
}
