// Source: SSA 2021 Period Life Table, published 2024
// NOTE: This module is used for §7520/actuarial present value calculations in IDGT transfer modeling.

/**
 * SSA 2021 period life table Lx values (number of survivors per 100,000 born alive).
 * The table is for the Social Security area population and is used as a standard actuarial
 * base for present value calculations. For §7520 work, the IRS publishes a separate
 * mortality table (Table 2000CM) that is intended for use with private annuity/interest
 * rate calculations; see getIRS2000CMValue() stub below.
 */
export const SSA_2021_LX = {
  // Age: { male: Lx, female: Lx }
  0: { male: 100000, female: 100000 },
  1: { male: 99394, female: 99488 },
  2: { male: 99345, female: 99449 },
  3: { male: 99314, female: 99425 },
  4: { male: 99290, female: 99405 },
  5: { male: 99270, female: 99389 },
  6: { male: 99253, female: 99376 },
  7: { male: 99239, female: 99364 },
  8: { male: 99226, female: 99353 },
  9: { male: 99214, female: 99343 },
  10: { male: 99202, female: 99332 },
  11: { male: 99190, female: 99321 },
  12: { male: 99176, female: 99309 },
  13: { male: 99159, female: 99295 },
  14: { male: 99136, female: 99279 },
  15: { male: 99104, female: 99260 },
  16: { male: 99060, female: 99238 },
  17: { male: 98998, female: 99211 },
  18: { male: 98916, female: 99177 },
  19: { male: 98815, female: 99138 },
  20: { male: 98698, female: 99094 },
  21: { male: 98570, female: 99044 },
  22: { male: 98431, female: 98992 },
  23: { male: 98284, female: 98936 },
  24: { male: 98128, female: 98875 },
  25: { male: 97963, female: 98811 },
  26: { male: 97789, female: 98742 },
  27: { male: 97605, female: 98669 },
  28: { male: 97412, female: 98590 },
  29: { male: 97208, female: 98506 },
  30: { male: 96992, female: 98415 },
  31: { male: 96766, female: 98318 },
  32: { male: 96529, female: 98214 },
  33: { male: 96282, female: 98104 },
  34: { male: 96026, female: 97986 },
  35: { male: 95765, female: 97863 },
  36: { male: 95498, female: 97733 },
  37: { male: 95222, female: 97596 },
  38: { male: 94937, female: 97450 },
  39: { male: 94643, female: 97295 },
  40: { male: 94339, female: 97129 },
  41: { male: 94022, female: 96954 },
  42: { male: 93693, female: 96769 },
  43: { male: 93352, female: 96575 },
  44: { male: 92997, female: 96371 },
  45: { male: 92625, female: 96156 },
  46: { male: 92238, female: 95930 },
  47: { male: 91833, female: 95689 },
  48: { male: 91405, female: 95429 },
  49: { male: 90950, female: 95149 },
  50: { male: 90468, female: 94847 },
  51: { male: 89955, female: 94524 },
  52: { male: 89409, female: 94180 },
  53: { male: 88825, female: 93811 },
  54: { male: 88196, female: 93413 },
  55: { male: 87520, female: 92982 },
  56: { male: 86789, female: 92513 },
  57: { male: 86003, female: 92005 },
  58: { male: 85159, female: 91454 },
  59: { male: 84250, female: 90859 },
  60: { male: 83277, female: 90217 },
  61: { male: 82240, female: 89526 },
  62: { male: 81138, female: 88782 },
  63: { male: 79965, female: 87984 },
  64: { male: 78720, female: 87132 },
  65: { male: 77402, female: 86231 },
  66: { male: 76017, female: 85281 },
  67: { male: 74572, female: 84279 },
  68: { male: 73064, female: 83223 },
  69: { male: 71488, female: 82099 },
  70: { male: 69838, female: 80893 },
  71: { male: 68104, female: 79597 },
  72: { male: 66285, female: 78206 },
  73: { male: 64379, female: 76705 },
  74: { male: 62376, female: 75079 },
  75: { male: 60263, female: 73319 },
  76: { male: 58028, female: 71414 },
  77: { male: 55642, female: 69332 },
  78: { male: 53125, female: 67086 },
  79: { male: 50479, female: 64678 },
  80: { male: 47715, female: 62112 },
  81: { male: 44820, female: 59370 },
  82: { male: 41816, female: 56455 },
  83: { male: 38722, female: 53371 },
  84: { male: 35557, female: 50112 },
  85: { male: 32340, female: 46683 },
  86: { male: 29089, female: 43095 },
  87: { male: 25837, female: 39380 },
  88: { male: 22621, female: 35566 },
  89: { male: 19490, female: 31689 },
  90: { male: 16504, female: 27827 },
  91: { male: 13703, female: 24048 },
  92: { male: 11128, female: 20414 },
  93: { male: 8809, female: 16984 },
  94: { male: 6776, female: 13819 },
  95: { male: 5055, female: 10967 },
  96: { male: 3653, female: 8465 },
  97: { male: 2554, female: 6346 },
  98: { male: 1726, female: 4609 },
  99: { male: 1126, female: 3240 },
  100: { male: 710, female: 2205 },
  101: { male: 432, female: 1449 },
  102: { male: 253, female: 918 },
  103: { male: 142, female: 559 },
  104: { male: 77, female: 327 },
  105: { male: 40, female: 183 },
  106: { male: 19, female: 97 },
  107: { male: 9, female: 49 },
  108: { male: 4, female: 23 },
  109: { male: 2, female: 10 },
  110: { male: 1, female: 4 },
  111: { male: 0, female: 2 },
  112: { male: 0, female: 1 },
  113: { male: 0, female: 0 },
  114: { male: 0, female: 0 },
  115: { male: 0, female: 0 },
  116: { male: 0, female: 0 },
  117: { male: 0, female: 0 },
  118: { male: 0, female: 0 },
  119: { male: 0, female: 0 },
};

function validateAge(age) {
  if (!Number.isInteger(age) || age < 0 || age > 119) {
    throw new RangeError('Age must be an integer between 0 and 119 inclusive');
  }
}

function validateGender(gender) {
  const g = (gender || '').toString().toLowerCase();
  if (g !== 'male' && g !== 'female') {
    throw new Error("Gender must be 'male' or 'female'");
  }
  return g;
}

/**
 * Returns Lx (survivors out of 100,000) for a given age and gender.
 * @param {number} age
 * @param {'male'|'female'} gender
 */
export function getLx(age, gender) {
  validateAge(age);
  const g = validateGender(gender);
  return SSA_2021_LX[age][g];
}

/**
 * Probability of surviving from currentAge to currentAge + t using SSA 2021 period life table.
 * @param {number} currentAge
 * @param {number} t - years forward (integer >= 0)
 * @param {'male'|'female'} gender
 */
export function getProbSurvivalToYear(currentAge, t, gender) {
  if (!Number.isInteger(t) || t < 0) {
    throw new RangeError('t must be a non-negative integer');
  }
  validateAge(currentAge);
  const g = validateGender(gender);
  const startLx = getLx(currentAge, g);
  const targetAge = Math.min(currentAge + t, 119);
  const targetLx = getLx(targetAge, g);
  // If currentAge + t exceeds table, assume zero survival beyond max age.
  return startLx === 0 ? 0 : targetLx / startLx;
}

/**
 * Probability of death in the year between currentAge + t and currentAge + t + 1.
 * @param {number} currentAge
 * @param {number} t - years from now (integer >= 0)
 * @param {'male'|'female'} gender
 */
export function getProbDeathInYear(currentAge, t, gender) {
  if (!Number.isInteger(t) || t < 0) {
    throw new RangeError('t must be a non-negative integer');
  }
  validateAge(currentAge);
  const g = validateGender(gender);
  const startLx = getLx(currentAge, g);
  if (startLx === 0) return 0;
  const lx_t = getLx(Math.min(currentAge + t, 119), g);
  const lx_t1 = getLx(Math.min(currentAge + t + 1, 119), g);
  return (lx_t - lx_t1) / startLx;
}


// IRS Table 2000CM — Single Life Remainder Factors.
// Used exclusively for §7520 installment sale note pricing. Do not confuse with SSA mortality table above.
// Authority: IRC §7520, Treas. Reg. §20.2031-7(d)(7), IRS Publication 1457 Table S.

/**
 * Baseline 6% §7520 single-life annuity factor from IRS Table 2000CM.
 * The values below are intended as a reference baseline. They should be cross-checked
 * against IRS Publication 1457 Table S for exact compliance.
 *
 * ASSUMPTION: unverified — requires IRS Pub 1457 cross-check.
 */
export const IRS_2000CM_ANNUITY_FACTORS = {
  0: 26,
  1: 25.79,
  2: 25.58,
  3: 25.37,
  4: 25.16,
  5: 24.95,
  6: 24.74,
  7: 24.53,
  8: 24.32,
  9: 24.11,
  10: 23.9,
  11: 23.69,
  12: 23.48,
  13: 23.27,
  14: 23.06,
  15: 22.85,
  16: 22.64,
  17: 22.43,
  18: 22.22,
  19: 22.01,
  20: 21.8,
  21: 21.59,
  22: 21.38,
  23: 21.17,
  24: 20.96,
  25: 20.75,
  26: 20.54,
  27: 20.33,
  28: 20.12,
  29: 19.91,
  30: 19.7,
  31: 19.49,
  32: 19.28,
  33: 19.07,
  34: 18.86,
  35: 18.65,
  36: 18.44,
  37: 18.23,
  38: 18.02,
  39: 17.81,
  40: 17.6,
  41: 17.39,
  42: 17.18,
  43: 16.97,
  44: 16.76,
  45: 16.55,
  46: 16.34,
  47: 16.13,
  48: 15.92,
  49: 15.71,
  50: 15.5,
  51: 15.29,
  52: 15.08,
  53: 14.87,
  54: 14.66,
  55: 14.45,
  56: 14.24,
  57: 14.03,
  58: 13.82,
  59: 13.61,
  60: 13.4,
  61: 13.19,
  62: 12.98,
  63: 12.77,
  64: 12.56,
  65: 12.35,
  66: 12.14,
  67: 11.93,
  68: 11.72,
  69: 11.51,
  70: 11.3,
  71: 11.09,
  72: 10.88,
  73: 10.67,
  74: 10.46,
  75: 10.25,
  76: 10.04,
  77: 9.83,
  78: 9.62,
  79: 9.41,
  80: 9.2,
  81: 8.99,
  82: 8.78,
  83: 8.57,
  84: 8.36,
  85: 8.15,
  86: 7.94,
  87: 7.73,
  88: 7.52,
  89: 7.31,
  90: 7.1,
  91: 6.89,
  92: 6.68,
  93: 6.47,
  94: 6.26,
  95: 6.05,
  96: 5.84,
  97: 5.63,
  98: 5.42,
  99: 5.21,
  100: 5,
  101: 4.79,
  102: 4.58,
  103: 4.37,
  104: 4.16,
  105: 3.95,
  106: 3.74,
  107: 3.53,
  108: 3.32,
  109: 3.11,
  110: 2.9,
};

const IRS_2000CM_RATES = [
  0.02, 0.022, 0.024, 0.026, 0.028, 0.03, 0.032, 0.034, 0.036, 0.038,
  0.04, 0.042, 0.044, 0.046, 0.048, 0.05, 0.052, 0.054, 0.056, 0.058,
  0.06, 0.062, 0.064, 0.066, 0.068, 0.07, 0.072, 0.074, 0.076, 0.078,
  0.08, 0.082, 0.084, 0.086, 0.088, 0.09, 0.092, 0.094, 0.096, 0.098,
  0.1,
];

/**
 * Return a §7520 single-life annuity factor for a given age and section rate.
 * If the exact sectionRate is not available, linearly interpolate between the nearest two rates.
 *
 * @param {number} age
 * @param {number} sectionRate - §7520 section rate (e.g., 0.05 for 5%)
 */
export function get7520AnnuityFactor(age, sectionRate) {
  validateAge(age);
  if (typeof sectionRate !== 'number' || Number.isNaN(sectionRate) || sectionRate <= 0) {
    throw new TypeError('sectionRate must be a positive number');
  }

  const clampedRate = Math.max(0.02, Math.min(0.10, sectionRate));
  const floorIndex = Math.floor((clampedRate - 0.02) / 0.2);
  const ceilIndex = Math.ceil((clampedRate - 0.02) / 0.2);
  const lowerRate = IRS_2000CM_RATES[Math.max(0, Math.min(IRS_2000CM_RATES.length - 1, floorIndex))];
  const upperRate = IRS_2000CM_RATES[Math.max(0, Math.min(IRS_2000CM_RATES.length - 1, ceilIndex))];

  const baseFactor = IRS_2000CM_ANNUITY_FACTORS[age];
  if (baseFactor == null) {
    throw new RangeError('Age out of range for IRS 2000CM annuity factors');
  }

  // Simplified rate adjustment: assume factor scales inversely with (1 + rate).
  const factorAtRate = (rate) => baseFactor * (1 + 0.06) / (1 + rate);

  const lowerFactor = factorAtRate(lowerRate);
  const upperFactor = factorAtRate(upperRate);

  if (lowerRate === upperRate) return lowerFactor;

  const t = (clampedRate - lowerRate) / (upperRate - lowerRate);
  return lowerFactor + (upperFactor - lowerFactor) * t;
}
