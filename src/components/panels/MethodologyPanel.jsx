import Card from '../ui/Card.jsx';
import { MORTALITY_TABLE_META } from '../../data/mortalityTable.js';
import { EXCLUSION_META } from '../../data/exclusionAmounts.js';

function Section({ title, children }) {
  return (
    <details className="group border-b border-line py-2 last:border-b-0">
      <summary className="flex items-center justify-between text-sm font-medium text-ink">
        {title}<span className="text-muted transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="mt-2 space-y-2 text-sm text-ink-2">{children}</div>
    </details>
  );
}

export default function MethodologyPanel() {
  return (
    <Card title="Methodology" subtitle="What is compared, which conventions are used, and the authorities relied on.">
      <Section title="What the NPV measures">
        <p>For every possible year of death, the model simulates two worlds year by year: <strong>keep</strong> — the asset stays in the estate, is taxed there, and heirs get a §1014 step-up; <strong>gift</strong> — the asset sits in the IDGT, the grantor pays its income tax (§§671–677; Rev. Rul. 2004-64), the gift uses exclusion as an adjusted taxable gift (§2001(b)), and there is no step-up in trust (Rev. Rul. 2023-2). The difference in what heirs receive, discounted and weighted by the probability of dying in that year, is the NPV. Nothing is ever added to the NPV as a separate “benefit”; every component is read off the same ledger.</p>
      </Section>
      <Section title="The swap and its timing">
        <p>Exercising the §675(4)(C) substitution power at the end of year <em>s</em> moves the appreciated asset back into the estate (it will be stepped up) and puts consideration of equal value into the trust (Rev. Rul. 85-13 — no gain; Rev. Rul. 2008-22 — no inclusion). The curve re-runs the ledger for every feasible <em>s</em>; a swap is infeasible when the other estate cannot fund it or when the holding has already been sold. The best year maximises NPV; the “deathbed bound” assumes the swap always precedes death and is an upper limit, not a plan.</p>
      </Section>
      <Section title="Federal tax mechanics">
        <ul className="list-disc space-y-1 pl-5">
          <li>Flat 40% above the applicable exclusion — exact because §2001(c) is flat above $1,000,000 and the unified credit absorbs the rest.</li>
          <li>Basic exclusion $15,000,000 for 2026 (§2010(c)(3), OBBBA §70106), indexed from 2027 at the rate you set; anti-clawback per Reg. §20.2010-1(c).</li>
          <li>Prior gifts are measured against the exclusion of their own year (§2001(g)(2)); gift tax paid now is tax-exclusive (§2502(c)), added back if death occurs within three years (§2035(b)), and increases trust basis under §1015(d)(6).</li>
          <li>A sale of the holding is taxed to the grantor on carryover basis (§1015(a); Rev. Rul. 85-13) wherever the holding sits; heirs pay capital-gains tax on un-stepped-up gain <em>k</em> years after death.</li>
        </ul>
      </Section>
      <Section title="Conventions (each can be overturned)">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Return-neutral:</strong> the holding reinvests its gross yield and the income tax is paid from the other estate in both worlds, so the gift's value is purely tax location, never a reinvestment-rate difference.</li>
          <li><strong>Cash-like consideration</strong> that earns the other-estate rate after tax; the residual component shows any departure.</li>
          <li>Heirs' rate includes NIIT by default; death is valued at year-end; gift tax is charged at the gift; the indexed exclusion is not rounded to $10,000; post-death growth over the <em>k</em> years cancels and is ignored.</li>
        </ul>
      </Section>
      <Section title="Components">
        <p><strong>Freeze</strong> — estate tax avoided on growth above the frozen gift value (including discount leverage), measured on a trust that had paid its own tax. <strong>Tax burn</strong> — the extra estate tax avoided because the trust compounds gross. <strong>Gift tax</strong> — net effect of paying gift tax now. <strong>Residual</strong> — non-neutral consideration, sale differentials, anti-clawback, discount-at-death inclusion (zero under defaults). <strong>Step-up</strong> — heirs' capital-gains cost of losing §1014, or its recovery by a swap. They sum exactly to the NPV.</p>
      </Section>
      <Section title="Data status">
        <ul className="list-disc space-y-1 pl-5">
          <li>Mortality: {MORTALITY_TABLE_META.name}, period year {MORTALITY_TABLE_META.periodYear} ({MORTALITY_TABLE_META.publishedIn}). <strong>{MORTALITY_TABLE_META.verified ? 'Verified' : 'UNVERIFIED'}</strong>{!MORTALITY_TABLE_META.verified && ' — the build environment could not reach ssa.gov; the table was carried forward and plausibility-checked only. Use the assumed-death-year mode for a table-independent result.'}</li>
          <li>Exclusion amounts: {EXCLUSION_META.authority} (checked {EXCLUSION_META.checkedOn}). {EXCLUSION_META.indexingNote}</li>
          <li>Rates: 37% top ordinary (permanent under OBBBA), 20% LTCG, 3.8% NIIT (§1411), 40% estate/gift — 2026.</li>
        </ul>
      </Section>
    </Card>
  );
}
