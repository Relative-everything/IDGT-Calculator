// Life-table registry: every mortality table the calculator can use, with its provenance. DATA ONLY — the engine
// (src/engine/mortality.js) turns an entry into survivors and death-year probabilities.
//
// To add a table: add a data file in this folder (published columns, never derived ones), then an entry below with
// its source, the date it was checked against the published source, `verified`, and published checksum values;
// the eval suite (evals/) and mortality.test.js pick it up from here. `basis` says which column the engine uses:
//   'q' — one-year death probabilities by exact age; closed at `terminalAge` (everyone alive at terminalAge − 1
//         dies within that year), because published tables stop at a last age with survivors remaining
//   'l' — survivors by age (legacy keyed format { age: { male, female } }); closed at the first zero

import { SSA_PERIOD_2023_TR2026 } from './ssaPeriod2023Tr2026.js';
import { SSA_2021_LX, MORTALITY_TABLE_META } from '../mortalityTable.js';

export const LIFE_TABLES = Object.freeze([
  Object.freeze({
    id: 'ssa-2023-tr2026',
    label: 'SSA 2023 period life table (2026 Trustees Report)',
    shortLabel: 'SSA 2023 period (2026 TR)',
    basis: 'q',
    terminalAge: 120,
    radix: 100000,
    ages: [0, 119],
    periodYear: 2023,
    publishedIn: '2026 OASDI Trustees Report',
    population: 'Social Security area population (general population; not adjusted for income or wealth)',
    sourceUrl: 'https://www.ssa.gov/oact/STATS/table4c6.html',
    provenance: 'Print of the SSA page supplied by the builder, docs/sources/ssa-period-life-table-2023-tr2026.pdf '
      + '(SHA-256 8f9a6c21b3010408028eeebb02a1f9529e213df7cefac0ce3d21c64723c8f3f5); double-extracted to '
      + 'docs/sources/ssa-period-life-table-2023-tr2026.csv',
    verified: true,
    checkedOn: '2026-09-27',
    // Published survivors (l_x) used as checksums by mortality.test.js and the eval suite.
    checksum: { male: { 65: 79084, 85: 35529, 100: 999 }, female: { 65: 87399, 85: 49469, 100: 2758 } },
    data: SSA_PERIOD_2023_TR2026,
  }),
  Object.freeze({
    id: 'ssa-2021-legacy',
    label: 'SSA 2021 period life table (legacy, unverified)',
    shortLabel: 'SSA 2021 period (legacy, unverified)',
    basis: 'l',
    terminalAge: null,
    radix: MORTALITY_TABLE_META.radix,
    ages: MORTALITY_TABLE_META.ageRange,
    periodYear: MORTALITY_TABLE_META.periodYear,
    publishedIn: MORTALITY_TABLE_META.publishedIn,
    population: 'Social Security area population',
    sourceUrl: MORTALITY_TABLE_META.sourceUrl,
    provenance: 'Carried forward from an earlier build; never checked against the published table. Kept only so earlier '
      + 'results can be reproduced.',
    verified: MORTALITY_TABLE_META.verified,
    checkedOn: MORTALITY_TABLE_META.checkedOn,
    checksum: MORTALITY_TABLE_META.checksum,
    data: SSA_2021_LX,
  }),
]);

export const DEFAULT_LIFE_TABLE_ID = 'ssa-2023-tr2026';

export const LIFE_TABLE_BY_ID = Object.freeze(Object.fromEntries(LIFE_TABLES.map((t) => [t.id, t])));
