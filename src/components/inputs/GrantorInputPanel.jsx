import { useMemo } from 'react';

const STATES = [
  { code: 'WA', name: 'Washington' },
  { code: 'OR', name: 'Oregon' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'IL', name: 'Illinois' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'NY', name: 'New York' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'ME', name: 'Maine' },
  { code: 'VT', name: 'Vermont' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'PA', name: 'Pennsylvania' },
];

export default function GrantorInputPanel({ grantor, onGrantorChange }) {
  const update = (field, value) => {
    onGrantorChange({ ...grantor, [field]: value });
  };

  const niitTooltip = useMemo(
    () => 'Net Investment Income Tax — fixed by IRC §1411 at 3.8%.',
    []
  );

  const validateRange = (value, min, max) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 'Required';
    if (value < min || value > max) return `Must be between ${min} and ${max}`;
    return null;
  };

  const ageError = validateRange(grantor.age, 18, 99);
  const fedOrdError = validateRange(grantor.fedOrdIncomeTaxRate, 0, 50);
  const fedLtcgError = validateRange(grantor.fedLtcgTaxRate, 0, 30);
  const stateOrdError = validateRange(grantor.stateOrdIncomeTaxRate, 0, 15);
  const stateLtcgError = validateRange(grantor.stateLtcgTaxRate, 0, 15);

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">Grantor Information</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Age</label>
          <input
            type="number"
            value={grantor.age}
            onChange={(e) => update('age', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          {ageError ? <p className="text-xs text-red-600">{ageError}</p> : null}
        </div>

        <div>
          <label className="text-sm font-medium">Gender</label>
          <select
            value={grantor.gender}
            onChange={(e) => update('gender', e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Federal Ordinary Income Tax Rate (%)</label>
          <input
            type="number"
            value={grantor.fedOrdIncomeTaxRate}
            onChange={(e) => update('fedOrdIncomeTaxRate', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          {fedOrdError ? <p className="text-xs text-red-600">{fedOrdError}</p> : null}
        </div>

        <div>
          <label className="text-sm font-medium">Federal LTCG Tax Rate (%)</label>
          <input
            type="number"
            value={grantor.fedLtcgTaxRate}
            onChange={(e) => update('fedLtcgTaxRate', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          {fedLtcgError ? <p className="text-xs text-red-600">{fedLtcgError}</p> : null}
        </div>

        <div>
          <label className="text-sm font-medium">State Ordinary Income Tax Rate (%)</label>
          <input
            type="number"
            value={grantor.stateOrdIncomeTaxRate}
            onChange={(e) => update('stateOrdIncomeTaxRate', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          {stateOrdError ? <p className="text-xs text-red-600">{stateOrdError}</p> : null}
        </div>

        <div>
          <label className="text-sm font-medium">State LTCG Tax Rate (%)</label>
          <input
            type="number"
            value={grantor.stateLtcgTaxRate}
            onChange={(e) => update('stateLtcgTaxRate', Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          {stateLtcgError ? <p className="text-xs text-red-600">{stateLtcgError}</p> : null}
        </div>

        <div>
          <label className="text-sm font-medium">NIIT Rate (%)</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              value={grantor.niitRate}
              readOnly
              className="w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-slate-600"
            />
            <span className="text-xs text-slate-500" title={niitTooltip}>?</span>
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="text-sm font-medium">State of Domicile</label>
          <select
            value={grantor.state}
            onChange={(e) => update('state', e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">Other / No State Estate Tax</option>
            {STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
