// Scenario portability without localStorage (repo rule): JSON export/import and CSV of the ranking.
// Pure helpers; the App wires them to buttons.

export const SCENARIO_VERSION = 1;

export function serializeScenario({ grantor, estate, settings, assets }) {
  return JSON.stringify({ version: SCENARIO_VERSION, savedAt: new Date().toISOString(), grantor, estate, settings, assets }, null, 2);
}

/** Returns { grantor, estate, settings, assets } or throws with a readable message. */
export function parseScenario(text, defaults) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
  if (!obj || typeof obj !== 'object') throw new Error('The file does not contain a scenario.');
  const pick = (part, fallback) => ({ ...fallback, ...(obj[part] && typeof obj[part] === 'object' ? obj[part] : {}) });
  const assets = Array.isArray(obj.assets) && obj.assets.length
    ? obj.assets.map((a, i) => ({ ...defaults.asset, ...a, id: a.id ?? `import-${i}` }))
    : [{ ...defaults.asset }];
  return {
    grantor: pick('grantor', defaults.grantor),
    estate: pick('estate', defaults.estate),
    settings: pick('settings', defaults.settings),
    assets,
  };
}

const csvCell = (v) => {
  if (v == null) return '';
  const s = typeof v === 'number' ? String(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function rankingToCsv(ranked) {
  const header = ['Rank', 'Asset', 'Taxable gift', 'Exclusion used', 'Gift tax paid', 'NPV no swap', 'Optimal swap year', 'NPV optimal swap',
    'NPV per $ taxable gift (opt)', 'NPV per $ taxable gift (none)', 'NPV per $ FMV (opt)', 'Deathbed-swap bound', 'Expected death year',
    'Cumulative taxable gift', 'Freeze (opt)', 'Tax burn (opt)', 'Gift tax (opt)', 'Residual (opt)', 'Step-up (opt)'];
  const lines = [header.map(csvCell).join(',')];
  for (const row of ranked) {
    const r = row.result;
    const c = r.components.opt;
    lines.push([row.rank, row.name, r.derived.Ug, r.derived.Uc, r.derived.G, r.npvNone, r.sStar === 0 ? 'none' : r.sStar, r.npvOpt,
      r.eff.opt, r.eff.none, r.effPerFMV.opt, r.npvPF, r.derived.expectedDeathYear, row.cumulativeTaxableGift,
      c.freeze, c.burn, c.giftTax, c.resid, c.stepUp].map(csvCell).join(','));
  }
  return lines.join('\n');
}
