import Card from '../ui/Card.jsx';

const ITEMS = [
  ['Installment sale to the IDGT', 'Freeze model with a note at the AFR (no grantor interest income under Rev. Rul. 85-13, note balance in the estate, §7872 term validation). AFR figures were only available as search snippets (medium confidence) during the build.'],
  ['GRAT', '§2702 zeroed-out annuity with the §7520 term-certain factor and §2036 inclusion by probability of death within the term. Needs Table 2010CM values (T.D. 9974), unobtainable from the build environment.'],
  ['SLAT', 'Spousal access, split gifts and joint-life mortality; same ledger with a second life.'],
  ['State estate & inheritance tax', 'The prior table was wrong for at least eight states (e.g. Oregon marked repealed, Nebraska coded as an estate tax). A verified 2026 table with each state\'s mechanics (NY cliff and 3-year add-back, CT gift tax, §2058 deduction) is required first.'],
  ['SSA life-table verification', 'The bundled table could not be checked against ssa.gov; replace the data file with the published column and set verified = true to activate the checksum test.'],
  ['UHNW mortality adjustment', 'A longevity multiplier or setback needs an actuarial source (SOA annuitant tables) before a default can be set.'],
  ['Monte Carlo and sensitivity tables', 'Distributions over growth, yield and the other-estate rate; tornado charts.'],
  ['Promissory-note swap consideration', 'Swapping with a note when the estate lacks liquidity (§7872, §2036 exposure).'],
  ['DSUE, GST exemption, annual-exclusion optimisation', 'Deceased-spouse unused exclusion (unindexed), GST allocation tracking for dynasty trusts, Crummey planning.'],
  ['Multi-asset joint optimisation', 'The ranking is marginal (each asset alone); order-dependent exclusion consumption is shown as a cumulative column only.'],
  ['PDF / Excel export', 'Scenario JSON and ranking CSV are available now; formatted reports are not.'],
];

export default function DeferredPanel() {
  return (
    <Card title="Not modelled in this version" subtitle="Each item was deferred because it could not be built and verified in the same session. Numbers you see here do not depend on them.">
      <ul className="space-y-2 text-sm">
        {ITEMS.map(([title, why]) => (
          <li key={title} className="border-b border-line pb-2 last:border-b-0">
            <span className="font-medium text-ink">{title}</span>
            <span className="text-ink-2"> — {why}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
