import Card from '../ui/Card.jsx';
import SelectField from '../ui/SelectField.jsx';
import Toggle from '../ui/Toggle.jsx';
import SwapProfilePanel from './SwapProfilePanel.jsx';

export default function ModelSettingsPanel({ settings, onChange, errors, neutralYield }) {
  const set = (field) => (value) => onChange({ ...settings, [field]: value });
  return (
    <Card title="Model settings" subtitle="Conventions you can overturn. Each is a one-line switch in the ledger.">
      <div className="space-y-3">
        <SelectField id="rankKey" label="Rank assets by" value={settings.rankKey} onChange={set('rankKey')}
          options={[
            { value: 'opt', label: 'NPV per $ of taxable gift — with the optimal swap year' },
            { value: 'none', label: 'NPV per $ of taxable gift — no swap' },
          ]} />
        <Toggle id="saleAppliesToBaseline" label="A scheduled sale also happens if the asset is kept" checked={settings.saleAppliesToBaseline} onChange={set('saleAppliesToBaseline')}
          hint="On: the sale is a liquidity event in both scenarios (gain taxed to the grantor either way). Off: hold-to-death with step-up is the comparison." />
        <Toggle id="discountAtDeath" label="Include a discounted interest at its discounted value at death" checked={settings.discountAtDeath} onChange={set('discountAtDeath')}
          hint="Off (default): the interest is included at full value in both scenarios and the discount is a transfer-tax construct only. On: inclusion at value × (1 − discount); heirs' basis steps only to the included value." />
        <SwapProfilePanel settings={settings} onChange={onChange} errors={errors} neutralYield={neutralYield} />
      </div>
    </Card>
  );
}
