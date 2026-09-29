import Card from '../ui/Card.jsx';
import { LIFE_TABLES } from '../../data/lifeTables/index.js';
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
        <p>Exercising the §675(4)(C) substitution power at the end of year <em>s</em> moves the appreciated asset back into the estate (it will be stepped up) and puts consideration of equal value into the trust (Rev. Rul. 85-13 — no gain; Rev. Rul. 2008-22 — no inclusion). The curve re-runs the ledger for every feasible <em>s</em>; a swap is infeasible when the other estate cannot fund it or when the holding has already been sold. The best year maximises NPV. The “deathbed-swap value” assumes the swap is made at the end of the year of death; it is not an upper limit — when the swapped-in consideration out-earns the asset, an earlier swap moves more growth out of the estate and is worth more.</p>
      </Section>
      <Section title="Mortality, life tables and married couples">
        <p>Death-year probabilities come from the life table you choose. The default is the <strong>SSA 2023 period life table used in the 2026 Trustees Report</strong>, loaded from the published page and checked value by value. The engine builds survivors from its one-year death probabilities (more precise than the rounded survivor column at advanced ages) and assumes everyone alive at 119 dies before 120.</p>
        <p><strong>Married couples</strong> are valued pair by pair over both spouses' death years, drawn independently from the same table. At the first death everything passes to the survivor under the marital deduction (§2056) and, with portability, the first spouse's unused exclusion (DSUE, §2010(c)(4); Reg. §20.2010-2(c)) is added to the survivor's; estate tax falls at the second death. The gift reduces the DSUE the grantor leaves by the exclusion it used. The IDGT's own mechanics still end at the <em>grantor's</em> death: the tax burn and the swap power stop, the grantor's assets are stepped up, and the trust pays its own income tax from then on. If the grantor's exclusion is exhausted and death comes within three years, the §2035(b) add-back is taxed at the first death and reduces the marital share (§2056(b)(4)). The ING passes to the survivor in a marital-deduction form at the grantor's death. The ledger then shows each year's expected outcome given the second death in that year.</p>
        <p><strong>Limits:</strong> a period table applies one year's death rates to every future year (no improvement), and the SSA table covers the whole population. Higher-income people live markedly longer (Chetty et al., JAMA 2016: 14.6 years between the top and bottom 1% of income for men, 10.1 for women), so the table likely places a UHNW client's death too early. Spouses' deaths are treated as independent; gift-splitting, community-property double step-up, remarriage and credit-shelter drafting are not modelled.</p>
      </Section>
      <Section title="Federal tax mechanics">
        <ul className="list-disc space-y-1 pl-5">
          <li>Flat 40% above the applicable exclusion — exact because §2001(c) is flat above $1,000,000 and the unified credit absorbs the rest. It is exact only while every exclusion involved is at least $1,000,000: a custom prior-gift exclusion below that (gifts made before 2002) falls in the graduated brackets, where results can be off by a constant.</li>
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
      <Section title="ING trust comparison">
        <p>The <strong>ING</strong> (incomplete non-grantor trust — NING, DING, WING) is run on the same ledger as a third world. The funding is an incomplete gift (Reg. §25.2511-2(b), (c)), so no exclusion is used and no gift tax is paid. The trust is a non-grantor trust (§641): an adverse-party distribution committee defeats §674(a) and §677(a), the grantor's HEMS power fits §674(b)(5)(A), and there are no §675 administrative powers — in particular no swap. It pays its own income tax at the trust's federal rates plus NIIT (§1411(a)(2)) plus the state rate it actually bears, and its trustee cost, from trust assets. The whole trust, accumulated income included, is in the gross estate at death (§2038(a)(1), §2036(a)(2); <em>Estate of O'Malley</em>, 383 U.S. 627 (1966)) and is stepped up (§1014(b)(9)).</p>
        <p>The IDGT is compared at its optimal swap year (the no-swap difference is also shown). The <strong>burn share</strong> input is the share of the IDGT's income tax the grantor actually pays; the trustee reimburses the rest under a discretionary clause (Rev. Rul. 2004-64). That clause is safe only without an express or implied understanding and where state law keeps the trust out of the grantor's creditors' reach; otherwise §2036(a)(1) applies. That risk is not priced.</p>
        <p>The ING's result splits exactly into four parts: <strong>location</strong> (the same tax paid from the trust instead of the other estate — not a tax benefit; it turns on the asset out-earning the rest of the estate), <strong>state-rate saving</strong> (net of the estate tax on the extra wealth), <strong>administration cost</strong>, and <strong>step-up</strong> (zero unless the interest is included at a discount).</p>
        <p>Breakevens re-run the full swap search at each trial. The solver scans the range, bisects the first sign change, and reports how many it saw; each reading states which side the ING wins on, taken from the signs rather than assumed. In a clearly taxable estate the IDGT's freeze usually outweighs any state-tax saving, so the burn-share and state-rate breakevens usually exist only near or below the exclusion.</p>
        <p>Conventions (each can be overturned): a flat top federal rate and NIIT from the first dollar (overstates the trust's tax by about $2,600 a year and about $1,300 once at a sale); accumulation, no distributions; the fee is not deducted and is charged on opening value; a fee beyond the after-tax yield is funded by selling a slice with pro-rata basis; the ING's state rate is an input, not a lookup; New York and California grantors are taxed on the ING's income personally (N.Y. Tax Law §612(b)(41); Cal. R&TC §17082) and pay it from the other estate.</p>
        <p>Confidence: the private letter rulings (201310002–006, 201410001–010; no precedential value, §6110(k)(3)), the no-rule status since about 2021, the state statute citations and the trust bracket figure (2025, Rev. Proc. 2024-40, used as a proxy) are medium confidence and should be verified before client use.</p>
      </Section>
      <Section title="Data status">
        <ul className="list-disc space-y-1 pl-5">
          {LIFE_TABLES.map((t) => (
            <li key={t.id}>Mortality: {t.label}. <strong>{t.verified ? `Verified ${t.checkedOn}` : 'UNVERIFIED'}</strong> — {t.provenance}</li>
          ))}
          <li>Exclusion amounts: {EXCLUSION_META.authority} (checked {EXCLUSION_META.checkedOn}). {EXCLUSION_META.indexingNote}</li>
          <li>Rates: 37% top ordinary (permanent under OBBBA), 20% LTCG, 3.8% NIIT (§1411), 40% estate/gift — 2026.</li>
        </ul>
      </Section>
    </Card>
  );
}
