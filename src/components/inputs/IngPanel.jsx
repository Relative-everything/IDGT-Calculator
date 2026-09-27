import Card from '../ui/Card.jsx';
import NumberField from '../ui/NumberField.jsx';
import Toggle from '../ui/Toggle.jsx';

/**
 * Inputs for the ING-versus-IDGT comparison (docs/changes/2026-09-27-ing-comparison/model.md §1).
 * The burn share changes the IDGT's own ledger; the ING fields describe the alternative vehicle.
 */
export default function IngPanel({ settings, onChange, errors }) {
  const set = (field) => (value) => onChange({ ...settings, [field]: value });
  const err = (f) => errors?.[f];
  return (
    <Card title="ING trust vs IDGT" subtitle="Compare the gift with an incomplete non-grantor trust, and test how much of the tax burn the grantor must carry.">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">IDGT tax burn</h3>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <NumberField id="burnShare" className="col-span-2" label="Share of trust income tax the grantor bears" value={settings.burnShare} onChange={set('burnShare')} suffix="%"
          error={err('burnShare')}
          tip="100% is the classic grantor-trust burn (§§671–677). Below 100%, the trustee reimburses the rest from trust assets under a discretionary clause (Rev. Rul. 2004-64). A reimbursement pattern risks estate inclusion under §2036(a)(1); that risk is not priced."
          hint="Applies to the IDGT's whole ledger and ranking, not only the comparison." />
      </div>

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">ING trust (incomplete gift, non-grantor)</h3>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <NumberField id="ingFedOrd" label="Trust federal ordinary rate" value={settings.ingFedOrd} onChange={set('ingFedOrd')} suffix="%" error={err('ingFedOrd')}
          tip="Trust brackets are compressed (§1(e)): the 37% top rate starts at about $15,650 of income (2025). NIIT from the grantor panel is added (§1411(a)(2))." />
        <NumberField id="ingFedLtcg" label="Trust federal LTCG rate" value={settings.ingFedLtcg} onChange={set('ingFedLtcg')} suffix="%" error={err('ingFedLtcg')}
          tip="§1(h): 20% top rate. NIIT from the grantor panel is added." />
        <NumberField id="ingStateRate" label="State rate the ING bears" value={settings.ingStateRate} onChange={set('ingStateRate')} suffix="%" error={err('ingStateRate')}
          hint="0% only for portfolio income and gains in a no-tax situs (NV, WY, SD, AK; DE without resident beneficiaries). Enter a rate for income sourced to a taxing state, or if the grantor's home state taxes the trust as a resident trust." />
        <NumberField id="ingAdminRate" label="Administration cost" value={settings.ingAdminRate} onChange={set('ingAdminRate')} suffix="%/yr" error={err('ingAdminRate')}
          tip="Corporate trustee at the situs, as a share of trust value each year. Not deducted for income tax (conservative)." />
        <Toggle id="ingStateTaxOnGrantor" className="col-span-2" label="Home state taxes the grantor on the ING's income (New York, California)"
          checked={settings.ingStateTaxOnGrantor} onChange={set('ingStateTaxOnGrantor')}
          hint="N.Y. Tax Law §612(b)(41) and Cal. R&TC §17082 treat an ING as a grantor trust for state tax. The grantor then pays the state tax from the other estate, and the ING saves none." />
      </div>
    </Card>
  );
}
