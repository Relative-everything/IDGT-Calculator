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
  ...marriedCases(),
];

// Married couples (docs/changes/2026-09-27-life-tables/model.md): the estate tax falls at the SECOND death. Assumed deaths
// grantor end of year 1, spouse end of year 2 unless stated; spouse aged 58; portability elected; no spouse gifts.
// Row 2 is the real pair (1, 2); row 1 shows both deaths in year 1 (display only).
function marriedCases() {
  const M = { ...BASE, married: true, ageSpouse: 58, lxSpouse: null, deathYearOverrideSpouse: 2, portability: true, PS: 0, XPS: 15_000_000 };
  const v2 = v * v;
  const cgt = (gain) => 0.25 * gain * v; // heirs sell a year after the second death
  const Y = { g: 0.07, gr: 0.07, y: 0.02, yr: 0.02 };
  return [
    (() => {
      const ETb = 0.4 * (53_045_000 + 1_210_000 - 15_300_000 - 15_000_000);
      const ETs = 0.4 * (53_045_000 - 15_300_000 - 14_000_000);
      const dH = (1_210_000 - ETs - cgt(1_010_000)) - (1_210_000 - ETb);
      return {
        id: 'HC-M1', title: 'Married, grantor dies first (yr 1), spouse yr 2: the gift costs the survivor $1M of DSUE',
        inputs: { ...M },
        lines: [
          'Grantor dies end of year 1: everything passes to the spouse (§2056); no tax; DSUE ported (§2010(c)(4))',
          'DSUE keep = X₁ − 0 = 15,000,000; DSUE gift = X₁ − U_g = 14,000,000 (Reg. §20.2010-2(c))',
          'Year 2: E₂ = 50M × 1.03² = 53,045,000; V₂ = 1.21M (keep: the spouse\'s, stepped up twice; gift: in the trust)',
          'ET keep = 40% × (53,045,000 + 1,210,000 − X₂ 15,300,000 − 15,000,000) = 9,582,000',
          'ET gift = 40% × (53,045,000 − 15,300,000 − 14,000,000) = 9,498,000; heirs\' CGT = 25% × 1,010,000 ÷ 1.04',
          'ΔH₂ = 84,000 − 242,788.46 = −158,788.46;  NPV = ΔH₂ ÷ 1.04²',
        ],
        expect: { 'row.none.2.dsueHold': 15_000_000, 'row.none.2.dsueGift': 14_000_000, 'row.none.2.ETb': ETb, 'row.none.2.ETs': ETs, 'row.none.2.dH': dH, npvNone: dH * v2 },
      };
    })(),
    (() => {
      const Vs2 = 1_090_000 * 1.07 + 21_800 * (1 - 0.458);
      const Bs2 = 220_000 + 21_800 * (1 - 0.458);
      const dH = 0.4 * (Vs2 - 1_000_000) - cgt(Vs2 - Bs2);
      return {
        id: 'HC-M2', title: 'HC-M1 with a 2% yield: the burn stops at the grantor\'s death — the trust pays year 2\'s tax',
        inputs: { ...M, ...Y },
        lines: [
          'Year 1 (grantor alive): V₁ = 1,070,000 + 20,000 = 1,090,000 in both worlds; the grantor pays 9,160 in both',
          'Year 2: keep — the spouse pays 45.8% × 21,800 = 9,984.40 from E; V₂ = 1,188,100',
          'Year 2: gift — no longer a grantor trust: the trust pays 9,984.40 from the yield; Vˢ₂ = 1,166,300 + 11,815.60 = 1,178,115.60',
          'Same total wealth; estate-tax base lower by Vˢ₂ − the $1M of DSUE the gift used → 40% × 178,115.60',
          'Trust basis 220,000 + 11,815.60 = 231,815.60 → CGT 25% × 946,300 ÷ 1.04;  ΔH₂ = 71,246.24 − 227,475.96',
        ],
        expect: { 'row.none.2.Vs': Vs2, 'row.none.2.dH': dH, npvNone: dH * v2 },
      };
    })(),
    (() => {
      const V2 = 1_188_100;
      const dH = 0.4 * (V2 - 1_000_000) - cgt(V2 - 241_800);
      return {
        id: 'HC-M3', title: 'Spouse dies first (yr 1), grantor yr 2: the burn continues; the spouse\'s DSUE = X₁ ports to the grantor',
        inputs: { ...M, ...Y, deathYearOverride: 2, deathYearOverrideSpouse: 1 },
        lines: [
          'Spouse dies end of year 1: estate to the grantor tax-free; DSUE = X₁ = 15,000,000 (no spouse gifts)',
          'Grantor pays the burn both years in both worlds → equal wealth; V₂ = 1,188,100; trust basis 241,800',
          'Grantor\'s exclusion X₂ + DSUE = 30,300,000 in both worlds; the gift is an adjusted taxable gift of 1,000,000',
          'ΔH₂ = 40% × 188,100 − 25% × 946,300 ÷ 1.04 = 75,240 − 227,475.96 = −152,235.96',
        ],
        expect: { 'row.none.2.dsueHold': 15_000_000, 'row.none.2.dH': dH, npvNone: dH * v2 },
      };
    })(),
    {
      id: 'HC-M4', title: 'Married, $20M estate: the two exclusions shelter everything, so the gift only costs the step-up',
      inputs: { ...M, E0: 20_000_000 },
      lines: [
        'Survivor\'s estate 21,218,000 + 1,210,000 = 22,428,000 < X₂ + DSUE = 30,300,000 (keep) → no tax; gift: 21,218,000 < 29,300,000',
        'ΔH₂ = − heirs\' CGT = −25% × 1,010,000 ÷ 1.04 = −242,788.46;  NPV = ΔH₂ ÷ 1.04²',
      ],
      expect: { 'row.none.2.ETb': 0, 'row.none.2.ETs': 0, npvNone: -cgt(1_010_000) * v2 },
    },
    {
      id: 'HC-M5', title: 'HC-M4 without the portability election: the grantor\'s unused exclusion is lost, so using it by gift is free',
      inputs: { ...M, E0: 20_000_000, portability: false },
      lines: [
        'No DSUE: the survivor has X₂ = 15,300,000 only',
        'ET keep = 40% × (22,428,000 − 15,300,000); ET gift = 40% × (21,218,000 − 15,300,000); difference 40% × 1,210,000',
        'ΔH₂ = 484,000 − 242,788.46 = 241,211.54;  NPV = ΔH₂ ÷ 1.04²',
      ],
      expect: { 'row.none.2.ETb': 0.4 * (22_428_000 - 15_300_000), 'row.none.2.ETs': 0.4 * (21_218_000 - 15_300_000), npvNone: (0.4 * 1_210_000 - cgt(1_010_000)) * v2 },
    },
    (() => {
      const ET1 = 0.4 * 400_000 / 0.6;
      const Es2 = (49_600_000 * 1.03 - ET1) * 1.03;
      const Hs = Es2 + 1_210_000 - 0.4 * (Es2 - 15_300_000) - cgt(1_210_000 - 520_000);
      const Hb = 54_255_000 - 0.4 * (54_255_000 - 15_300_000);
      return {
        id: 'HC-M6', title: 'Exclusion exhausted, grantor dies in year 1: the §2035(b) add-back is taxed at the FIRST death, tax-inclusive',
        inputs: { ...M, P: 15_000_000, XP: 15_000_000 },
        lines: [
          'Gift tax G = 40% × 1,000,000 = 400,000 at t = 0; trust basis 200,000 + 400,000 × 0.8 = 520,000 (§1015(d)(6))',
          'Grantor dies within 3 years: G is in the gross estate (§2035(b)) and cannot pass to the spouse → taxable',
          'The tax is paid from the marital share, so it is itself taxable (§2056(b)(4)(A)): ET₁ = 0.4 × (400,000 + ET₁) → ET₁ = 266,666.67',
          'No DSUE in either world (the prior gifts used the whole exclusion)',
          'Gift: E₂ = (49,600,000 × 1.03 − ET₁) × 1.03; survivor taxed on E₂ − 15,300,000; heirs\' CGT on 1,210,000 − 520,000',
          'Keep: survivor taxed on 54,255,000 − 15,300,000;  NPV = (Hˢ − Hᵇ) ÷ 1.04²',
        ],
        expect: { 'row.none.2.ET1': ET1, 'row.none.2.dsueGift': 0, npvNone: (Hs - Hb) * v2 },
      };
    })(),
    (() => {
      const E2 = (50_000_000 * 1.03 - 0.458 * 20_000) * 1.03 - 0.458 * 21_800;
      const ETb = 0.4 * (E2 + 1_188_100 - 15_300_000 - 5_000_000);
      const dH = 0.4 * (1_188_100 - 1_000_000) - cgt(1_188_100 - 241_800);
      return {
        id: 'HC-M7', title: 'HC-M3 where the spouse made $10M of gifts in 2025: the spouse leaves only $5M of DSUE',
        inputs: { ...M, ...Y, deathYearOverride: 2, deathYearOverrideSpouse: 1, PS: 10_000_000, XPS: 13_990_000 },
        lines: [
          'Spouse\'s gifts sheltered by the 2025 exclusion (13,990,000): the spouse used 10,000,000 of it',
          'DSUE = min(X₁, X₁ − (0 + 10,000,000)) = 5,000,000 (Reg. §20.2010-2(c))',
          'Keep: E₂ = (51,500,000 − 9,160) × 1.03 − 9,984.40 = 53,025,580.80; TE = E₂ + 1,188,100',
          'ET keep = 40% × (54,213,680.80 − X₂ 15,300,000 − 5,000,000) = 13,565,472.32',
          'Both worlds taxable, so the DSUE level cancels: ΔH₂ is HC-M3\'s −152,235.96',
        ],
        expect: { 'row.none.2.dsueHold': 5_000_000, 'row.none.2.ETb': ETb, 'row.none.2.dH': dH },
      };
    })(),
    (() => {
      const X3 = 15_000_000 * 1.02 ** 2;
      const Eg3 = ((50_000_000 * 1.03 - 1_100_000) * 1.03 - 0.288 * 110_000) * 1.03;
      const W3 = 1_100_000 * 1.03 ** 2;
      const Hs = Eg3 + 1_331_000 + W3 - 0.4 * (Eg3 + 1_331_000 - X3 - 14_000_000);
      const Ek3 = (50_000_000 * 1.03 ** 2 - 0.288 * 110_000) * 1.03;
      const Hb = Ek3 + 1_331_000 - 0.4 * (Ek3 + 1_331_000 - X3 - 15_000_000);
      const Vn3 = (1_210_000 - 0.288 * 1_010_000) * 1.1;
      const En3 = 50_000_000 * 1.03 ** 3;
      const Hn = En3 + Vn3 - 0.4 * (En3 - X3 - 14_000_000) - cgt(Vn3 - (1_210_000 - 0.288 * 1_010_000));
      return {
        id: 'HC-M8', title: 'Swap, then the grantor dies (yr 1): the swapped-back asset is stepped up, so the spouse\'s sale in yr 2 taxes only post-death gain',
        inputs: { ...M, S: 2, gr: 0.10, yr: 0, deathYearOverrideSpouse: 3 },
        lines: [
          'Swap at the end of year 1: the grantor pays 1,100,000 into the trust (cash-like consideration, 3% net)',
          'Grantor dies end of year 1: the asset passes to the spouse at 1,100,000 basis (§1014); DSUE = 15M − 1M = 14M',
          'Year 2: the spouse sells at 1,210,000 → gain tax 28.8% × 110,000 = 31,680 (keep world: the same sale, same tax)',
          'Year 3: V₃ = 1,331,000 in both; trust W₃ = 1,166,990 outside the estate; heirs\' CGT 0 (all stepped up / cash)',
          'ΔH₃(s = 1) = 40% × (W₃ − 1,000,000 of DSUE used) = 66,796;  NPV(1) = 66,796 ÷ 1.04³',
          'No swap: the trust (now non-grantor) sells in year 2 and pays 28.8% × 1,010,000 itself; heirs pay CGT on the year-3 gain',
        ],
        expect: { 'curve.1': (Hs - Hb) * v ** 3, npvNone: (Hn - Hb) * v ** 3 },
      };
    })(),
    (() => {
      const Vi1 = 1_070_000 + 20_000 * (1 - 0.408);
      const Yi2 = 0.02 * Vi1;
      const dW = (51_500_000 * 1.03 - 0.458 * Yi2 + Vi1 * 1.07 + Yi2) - ((50_000_000 * 1.03 - 9_160) * 1.03 - 9_984.4 + 1_188_100);
      return {
        id: 'HC-M9', title: 'ING, grantor dies first (yr 1): the ING property passes to the spouse stepped up; the spouse pays yr 2\'s tax at the grantor\'s rate',
        inputs: { ...M, ...Y },
        lines: [
          'Year 1: the ING pays 40.8% × 20,000 = 8,160 from itself → V₁ = 1,081,840; keep: the grantor pays 9,160 from E',
          'Grantor dies: the ING property passes to the spouse (marital form, M-9), stepped up; no fee or trust tax after',
          'Year 2: the spouse pays 45.8% × 2% × 1,081,840 = 9,909.65 from E; V₂ = 1,179,205.60; keep: V₂ = 1,188,100, tax 9,984.40',
          'Wealth difference 615.15, taxed at 40% in both worlds (same exclusions, everything stepped up)',
          'ΔH₂ = 0.6 × 615.15 = 369.09;  ING NPV = ΔH₂ ÷ 1.04²',
        ],
        expect: { 'ing.npv': 0.6 * dW * v2 },
      };
    })(),
    {
      id: 'HC-M10', title: 'Both die in year 1: the grantor is taken to die first (J-3); both worlds taxable, so ΔH equals the single-life HC01',
      inputs: { ...M, deathYearOverrideSpouse: 1 },
      lines: [
        'Same-year deaths: grantor first, the spouse\'s estate taxed at the end of year 1 with the grantor\'s DSUE',
        'Keep: 40% × (51,500,000 + 1,100,000 − 15,000,000 − 15,000,000); gift: 40% × (51,500,000 − 15,000,000 − 14,000,000)',
        'ΔH₁ = 40% × 100,000 − 25% × 900,000 ÷ 1.04 = −176,346.15 (as HC01);  NPV = ΔH₁ ÷ 1.04',
      ],
      expect: { 'row.none.1.grantorFirst': 1, 'row.none.1.dH': 0.4 * 100_000 - cgt(900_000), npvNone: (0.4 * 100_000 - cgt(900_000)) * v },
    },
  ];
}

/**
 * Mortality hand checks (published SSA columns; docs/sources/ssa-period-life-table-2023-tr2026.csv). `compute(ctx)`
 * receives { engine, table } helpers from the suite and returns the value the engine produces.
 */
export const MORTALITY_HAND_CASES = [
  { id: 'HC-L1', title: 'Male aged 65 dies within the year with the published q₆₅ = 0.016455', sex: 'male', age: 65, what: 'q1', expect: 0.016455, tol: 1e-12 },
  { id: 'HC-L2', title: 'Female aged 85 dies within the year with the published q₈₅ = 0.071752', sex: 'female', age: 85, what: 'q1', expect: 0.071752, tol: 1e-12 },
  { id: 'HC-L3', title: 'Male 65 survives 20 years: l₈₅ ÷ l₆₅ = 35,529 ÷ 79,084 (published survivors, rounded to whole lives)', sex: 'male', age: 65, what: 'survive20', expect: 35_529 / 79_084, tol: 2e-5 },
  { id: 'HC-L4', title: 'Male 65 complete life expectancy Σ (t − ½)·q_t = published e₆₅ = 18.12', sex: 'male', age: 65, what: 'e', expect: 18.12, tol: 0.006 },
  { id: 'HC-L5', title: 'Female 63 complete life expectancy = published e₆₃ = 22.27', sex: 'female', age: 63, what: 'e', expect: 22.27, tol: 0.006 },
  {
    id: 'HC-L6', title: 'Two-year toy lives: l_G = (1000, 600, 0), l_S = (1000, 800, 0) → second death q^L = (0.4 × 0.2, 1 − 0.08) = (0.08, 0.92)',
    joint: { lxG: [1000, 600, 0], lxS: [1000, 800, 0] }, expect: [0.08, 0.92], expectMean: 1.92, tol: 1e-15,
  },
];
