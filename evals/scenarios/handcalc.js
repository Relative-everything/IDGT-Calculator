// Layer 3 — hand calculations. Each case is small enough to do on paper; the expected value is a CLOSED FORM
// (no simulation loop), and the derivation is written out line by line so a reviewer can re-do it with a
// calculator. Both the engine and the oracle are graded against these numbers, which guards the oracle itself.

const BASE = {
  age: 60, lx: null, deathYearOverride: 1, FMV: 1_000_000, B0: 200_000, g: 0.10, y: 0, S: 0, gr: 0.10, yr: 0,
  delta: 0, annualExclusions: 0, tauOrd: 0.458, tauCg: 0.288, tauBene: 0.25, tauE: 0.40, d: 0.04, rE: 0.03, pi: 0.02,
  X0: 15_000_000, P: 0, XP: 15_000_000, E0: 50_000_000, k: 1, bSw: null, gSw: null, ySw: null, tauSw: null,
  discountAtDeath: false, saleAppliesToBaseline: true,
  stateOrd: 0.05, stateCg: 0.05, niit: 0.038, ingFedOrd: 0.37, ingFedLtcg: 0.20, ingStateRate: 0, ingAdminRate: 0,
  ingStateTaxOnGrantor: false, burnShare: 1,
};
const v = 1 / 1.04;

export const HAND_CASES = [
  (() => {
    const V1 = 1_100_000;
    const dH = 0.4 * (V1 - 1_000_000) - 0.25 * (V1 - 200_000) * v;
    return {
      id: 'HC01', title: 'Fully taxable estate, no yield, death end of year 1, no swap',
      inputs: { ...BASE },
      lines: [
        'V₁ = 1,000,000 × 1.10 = 1,100,000 in both worlds; E identical (no burn, no gift tax)',
        'Estate tax saved by the gift = 40% × (V₁ − taxable gift) = 40% × 100,000 = 40,000',
        "Heirs' CGT on carryover basis = 25% × (1,100,000 − 200,000) ÷ 1.04 = 216,346.15",
        'ΔH₁ = 40,000 − 216,346.15 = −176,346.15;  NPV = ΔH₁ ÷ 1.04',
      ],
      expect: { 'row.none.1.dH': dH, npvNone: dH * v },
    };
  })(),
  (() => {
    const V1 = 1_000_000 * 1.10 + 20_000;
    const dH = 0.4 * (V1 - 1_000_000) - 0.25 * (V1 - 220_000) * v;
    return {
      id: 'HC02', title: 'HC01 with a 2% yield (grantor pays the burn in both worlds)',
      inputs: { ...BASE, y: 0.02 },
      lines: [
        'Yield 20,000 reinvested gross: V₁ = 1,120,000, basis 220,000 in both worlds',
        'Burn 45.8% × 20,000 = 9,160 paid from E in BOTH worlds → no wealth difference',
        'ΔH₁ = 40% × 120,000 − 25% × 900,000 ÷ 1.04 = 48,000 − 216,346.15 = −168,346.15',
      ],
      expect: { 'row.none.1.dH': dH, npvNone: dH * v },
    };
  })(),
  (() => {
    const dH = -0.25 * 900_000 * v;
    return {
      id: 'HC03', title: 'Estate below the exclusion ($2M): the gift only loses the step-up',
      inputs: { ...BASE, E0: 2_000_000 },
      lines: ['No estate tax in either world', 'ΔH₁ = −25% × 900,000 ÷ 1.04 = −216,346.15'],
      expect: { 'row.none.1.dH': dH, npvNone: dH * v },
    };
  })(),
  (() => {
    const dH = 0.4 * 100_000;
    return {
      id: 'HC04', title: 'HC01 with a deathbed swap (end of year 1)',
      inputs: { ...BASE },
      lines: [
        'Grantor pays 1,100,000 cash for the asset: E falls 1.1M, asset (1.1M) returns — gross estate unchanged vs keep',
        'Adjusted taxable gift stays 1,000,000, so the estate-tax base is 1.1M − 1.0M = 100,000 lower than keep',
        'Asset stepped up (§1014); trust holds cash with full basis → no heirs\' CGT',
        'ΔH₁(s=1) = 40% × 100,000 = 40,000;  NPV(1) = 40,000 ÷ 1.04 = 38,461.54',
      ],
      expect: { 'curve.1': dH * v, npvOpt: dH * v, sStar: 1 },
    };
  })(),
  (() => {
    const inputs = { ...BASE, deathYearOverride: 5, g: 0.07, gr: 0.07, P: 15_000_000, XP: 15_000_000 };
    const G = 400_000;
    const BT0 = 200_000 + G * (800_000 / 1_000_000);
    const V5 = 1.07 ** 5 * 1_000_000;
    const dH = 0.4 * V5 - 0.6 * G * 1.03 ** 5 - 0.25 * (V5 - BT0) * v;
    return {
      id: 'HC05', title: 'Exclusion exhausted: gift tax paid, death in year 5 (outside §2035(b))',
      inputs,
      lines: [
        'G = 40% × 1,000,000 = 400,000 paid at t=0 (tax-exclusive)',
        '§1015(d)(6): basis = 200,000 + 400,000 × (800,000 ÷ 1,000,000) = 520,000',
        'V₅ = 1.07⁵ × 1,000,000 = 1,402,551.73',
        'Estate tax saved: 40% × V₅ (asset out) + 40% × G·1.03⁵ (tax dollars out); wealth lost: G·1.03⁵',
        'ΔH₅ = 0.4·V₅ − 0.6·G·1.03⁵ − 0.25·(V₅ − 520,000) ÷ 1.04',
      ],
      expect: { 'derived.G': G, 'derived.BT0': BT0, 'row.none.5.dH': dH, npvNone: dH * v ** 5 },
    };
  })(),
  (() => {
    const inputs = { ...BASE, deathYearOverride: 2, g: 0.07, gr: 0.07, P: 15_000_000, XP: 15_000_000 };
    const G = 400_000;
    const V2 = 1.07 ** 2 * 1_000_000;
    const dH = 0.4 * V2 - 0.6 * G * 1.03 ** 2 - 0.4 * G - 0.25 * (V2 - 520_000) * v;
    return {
      id: 'HC06', title: 'HC05 with death in year 2: §2035(b) pulls the gift tax back in',
      inputs,
      lines: ['As HC05, plus the 400,000 gift tax is added to the gross estate (−40% × 400,000)', 'ΔH₂ = 0.4·V₂ − 0.6·G·1.03² − 0.4·G − 0.25·(V₂ − 520,000) ÷ 1.04'],
      expect: { 'row.none.2.dH': dH, npvNone: dH * v ** 2 },
    };
  })(),
  (() => {
    const dHt = (t) => { const V = 1.1 ** t * 1_000_000; return 0.4 * (V - 1_000_000) - 0.25 * (V - 200_000) * v; };
    const npv = 0.4 * v * dHt(1) + 0.6 * v ** 2 * dHt(2);
    return {
      id: 'HC07', title: 'Two-year life table l = [1000, 600, 0]: q = (0.4, 0.6)',
      inputs: { ...BASE, age: 0, deathYearOverride: null, lx: [1000, 600, 0] },
      lines: ['q₁ = (1000 − 600)/1000 = 0.4; q₂ = 600/1000 = 0.6', 'NPV = 0.4·ΔH₁/1.04 + 0.6·ΔH₂/1.04², ΔHₜ = 0.4(Vₜ − 1M) − 0.25(Vₜ − 0.2M)/1.04'],
      expect: { npvNone: npv, expectedDeathYear: 1.6 },
    };
  })(),
  (() => {
    const dH = 0.6 * 20_000 * (0.458 - 0.408);
    return {
      id: 'HC08', title: 'ING, fully taxable, no fee: state-rate saving net of estate tax',
      inputs: { ...BASE, g: 0.07, gr: 0.07, y: 0.02, yr: 0.02 },
      lines: [
        'Keep: grantor pays 45.8% × 20,000 = 9,160 from E. ING: trust pays 40.8% × 20,000 = 8,160 from itself',
        'Pre-tax wealth: ING family +1,000; everything is in the estate in both worlds → 40% estate tax on it',
        'ΔH₁ = (1 − 0.4) × 1,000 = 600;  ING NPV = 600 ÷ 1.04',
      ],
      expect: { 'ing.npv': dH * v },
    };
  })(),
  (() => {
    const shortfall = 0.408 * 5_000 + 10_000 - 5_000;
    const sold = shortfall / (1 - 0.238);
    const Vn = 1_070_000 - sold;
    const dTW = (51_500_000 + Vn) - (51_500_000 - 0.458 * 5_000 + 1_075_000);
    const dH = 0.6 * dTW;
    return {
      id: 'HC09', title: 'ING fee above the after-tax yield: liquidation of a zero-basis slice',
      inputs: { ...BASE, B0: 0, g: 0.07, gr: 0.07, y: 0.005, yr: 0.005, ingAdminRate: 0.01 },
      lines: [
        'Yield cash 5,000; trust tax 40.8% × 5,000 = 2,040; fee 1% × 1,000,000 = 10,000 → cash needed 12,040',
        'All 5,000 of yield cash is spent; shortfall 7,040 is raised by selling part of the 1,070,000 holding',
        'Basis 0 → the slice is all gain taxed at 23.8%: slice = 7,040 ÷ (1 − 0.238) = 9,238.85',
        'V₁ = 1,070,000 − 9,238.85 = 1,060,761.15 (NOT 1,075,000 − 7,040 − 1,675.52: the yield cash cannot be spent twice)',
        'Keep: V = 1,075,000, E = 51,500,000 − 2,290. ΔTW = −11,948.85; both taxable → ΔH₁ = 0.6 × ΔTW',
      ],
      expect: { 'ing.row.1.Vn': Vn, 'ing.npv': dH * v },
    };
  })(),
  (() => {
    const Vs = 1_070_000 + 20_000 * (1 - 0.458);
    const dH = 0.4 * (1_090_000 - 9_160 - 1_000_000) - 0.25 * (Vs - (200_000 + 20_000 * (1 - 0.458))) * v;
    return {
      id: 'HC10', title: 'IDGT with burn share 0% (trustee reimburses all of the income tax)',
      inputs: { ...BASE, g: 0.07, gr: 0.07, y: 0.02, yr: 0.02, burnShare: 0 },
      lines: [
        'Trust pays its own 9,160: Vˢ₁ = 1,070,000 + 20,000 × 0.542 = 1,080,840; keep pays 9,160 from E',
        'Pre-tax wealth identical; estate-tax base lower by Vᵇ − 9,160 − 1,000,000 = 80,840',
        'ΔH₁ = 0.4 × 80,840 − 0.25 × (1,080,840 − 210,840) ÷ 1.04',
      ],
      expect: { 'row.none.1.dH': dH },
    };
  })(),
  (() => {
    const inputs = { ...BASE, B0: 300_000, annualExclusions: 190_000, P: 15_000_000, XP: 15_000_000 };
    const Ug = 810_000;
    const G = 0.4 * Ug;
    const BT0 = 300_000 + Math.min(G, G * (1_000_000 - 300_000) / Ug);
    return {
      id: 'HC11', title: '§1015(d)(6) with annual exclusions (Reg. §1.1015-5(c))',
      inputs,
      lines: [
        'Amount of the gift (after 10 × 19,000 annual exclusions) = 810,000; gift tax = 40% × 810,000 = 324,000',
        'Net appreciation = FMV of the gift − donor basis = 1,000,000 − 300,000 = 700,000 (annual exclusions do not reduce FMV)',
        'Basis increase = 324,000 × 700,000 ÷ 810,000 = 280,000 → trust basis 580,000',
      ],
      expect: { 'derived.Ug': Ug, 'derived.G': G, 'derived.BT0': BT0 },
    };
  })(),
  (() => {
    const dH = 0.4 * (770_000 - 700_000) + 0.25 * (330_000 - 900_000) * v;
    return {
      id: 'HC12', title: 'Discount also applied at death (30%): keep is included at 70%',
      inputs: { ...BASE, delta: 0.30, discountAtDeath: true },
      lines: [
        'Keep: included at 0.7 × 1,100,000 = 770,000; heirs\' basis 770,000 → CGT on 330,000',
        'Gift: taxable gift 700,000; trust basis 200,000 → CGT on 900,000',
        'ΔH₁ = 0.4 × (770,000 − 700,000) + 0.25 × (330,000 − 900,000) ÷ 1.04',
      ],
      expect: { 'row.none.1.dH': dH },
    };
  })(),
  {
    id: 'HC13', title: 'Swap the grantor cannot fund: other estate $500k, asset $1.1M',
    inputs: { ...BASE, E0: 500_000 },
    lines: ['Consideration 1,100,000 > other estate 530,000 → swap infeasible, not executed'],
    expect: { 'curveFeasible.1': false, sStar: 0 },
  },
];
