#!/usr/bin/env node
// Mutation testing — grades the eval suite and the unit tests themselves (evals/README.md, "Grade the suite itself").
//
//   node evals/mutation.mjs            # every mutation (≈ 25 s each)
//   node evals/mutation.mjs M05 M10    # a subset
//
// Each mutation injects ONE realistic defect into the source (a single exact-string replacement), runs the quick eval
// suite and the engine/hook unit tests, records whether each turned red, and restores the file byte for byte (also on
// failure or Ctrl-C). A mutation whose target string is no longer in the source is reported as STALE, never as caught:
// update the target when the code it guards changes. Results: evals/results/mutation.json (the committed record of a
// full run); a subset run writes evals/results/mutation-subset.json.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// [id, defect, file, exact target, replacement]
export const MUTATIONS = [
  ['M01', "spouse's table column wired to the grantor's sex", 'src/hooks/buildInputs.js',
    'lxFor(grantor.lifeTable, grantor.spouseSex)', 'lxFor(grantor.lifeTable, grantor.sex)'],
  ['M02', 'legacy table choice silently falls back to the default table', 'src/hooks/buildInputs.js',
    'return LIFE_TABLE_BY_ID[id] ?? LIFE_TABLE_BY_ID[DEFAULT_LIFE_TABLE_ID];', 'return LIFE_TABLE_BY_ID[DEFAULT_LIFE_TABLE_ID];'],
  ['M03', 'q-basis table not closed at 120 (published q₁₁₉ used, one extra year)', 'src/engine/mortality.js',
    '  l[terminalAge] = 0;', '  l[terminalAge] = l[terminalAge - 1] * (1 - q[terminalAge - 1]);'],
  ['M04', 'second-death distribution in the difference form (cancels in the tail)', 'src/engine/mortality.js',
    '    out[t - 1] = g * s + (g * FS + s * FG);\n    FG += g;\n    FS += s;',
    '    const prev = FG * FS;\n    FG += g;\n    FS += s;\n    out[t - 1] = (t > qG.length ? 1 : FG) * (t > qS.length ? 1 : FS) - prev;'],
  ['M05', "the gift does not reduce the grantor's DSUE", 'src/engine/marriedModel.js',
    '(add + ET1 + c.usedPrior + Uc)', '(add + ET1 + c.usedPrior)'],
  ['M06', 'first-death tax not grossed up (§2056(b)(4)(A) ignored)', 'src/engine/marriedModel.js',
    'const ET1 = b > 0 ? c.tauE * b / (1 - c.tauE) : 0;', 'const ET1 = b > 0 ? c.tauE * b : 0;'],
  ['M07', "the IDGT stays a grantor trust after the grantor's death (pays no tax)", 'src/engine/marriedModel.js',
    'const net = yt * (1 - tauOrd) * Vs;', 'const net = yt * Vs;'],
  ['M08', "the spouse's DSUE ignores the spouse's own prior gifts", 'src/engine/marriedModel.js',
    'dsueSpouse[j] = pos(Math.min(X(j), Math.max(X(j), usedPriorS) - usedPriorS));', 'dsueSpouse[j] = pos(X(j));'],
  ['M09', 'portability election ignored (always on)', 'src/engine/marriedModel.js',
    'const portability = inp.portability ?? true;', 'const portability = true;'],
  ['M10', 'swapped-back asset not stepped up at the first death', 'src/engine/marriedModel.js',
    'let Bs = swapped ? Vs * f : r.Bs;', 'let Bs = r.Bs;'],
  ['M11', 'survivor taxed at the wrong rate on the ING property after the first death', 'src/engine/marriedModel.js',
    'En = En * (1 + rE) - tauOrd * Y;', 'En = En * (1 + rE) - (tauOrd + 0.01) * Y;'],
  ['M12', 'FIRST_DEATH_TAX raised although the spouse surely dies first', 'src/engine/marriedModel.js',
    'if (qG[i - 1] > 0 && spouseAlive > 0 && giftFirstDeath(c, i).ET1 > 0)', 'if (qG[i - 1] > 0 && giftFirstDeath(c, i).ET1 > 0)'],
  ['M13', "ING fee warning looks past the grantor's death", 'src/engine/ingModel.js',
    'const ingYears = inp.married ? idgt.derived.NG : N;', 'const ingYears = N;'],
  ['M14', 'same-year deaths double-counted in the NPV (half weight also given to spouse-first)', 'src/engine/marriedModel.js',
    'for (let j = 1; j <= Math.min(i - 1, NS); j += 1) {\n    const w = qS[j - 1];\n    if (w !== 0) sum += w * vi * pairSpouseFirst(c, r, j, null);',
    'for (let j = 1; j <= Math.min(i, NS); j += 1) {\n    const w = qS[j - 1] * (j === i ? 0.5 : 1);\n    if (w !== 0) sum += w * vi * pairSpouseFirst(c, r, j, null);'],
  // inputs audit page (docs/changes/2026-09-28-inputs-audit/plan.md)
  ['M15', 'audit page shows the wrong engine input for the income yield', 'src/hooks/inputRegister.js',
    "{ key: 'yield', label: 'Income yield', kind: 'pct', engine: 'y', frac: 'return' },", "{ key: 'yield', label: 'Income yield', kind: 'pct', engine: 'g', frac: 'return' },"],
  ['M16', "audit page's taxable gift ignores the annual exclusions", 'src/engine/inputAudit.js',
    'taxableGift: Math.max(0, giftValue - annualExclusions),', 'taxableGift: Math.max(0, giftValue),'],
  ['M17', 'an asset tick survives edits (fingerprint covers the name only)', 'src/hooks/inputRegister.js',
    "return fnv1a(JSON.stringify(ASSET_FIELDS.map((f) => String(asset[f.key] ?? ''))));", "return fnv1a(String(asset.name ?? ''));"],
  ['M18', 'control totals silently count an unreadable cell as zero', 'src/engine/inputAudit.js',
    'if (Number.isFinite(v)) sum += cents ? Math.round(v * CENTS_PER_DOLLAR) : v;\n      else skipped += 1;',
    'sum += Number.isFinite(v) ? (cents ? Math.round(v * CENTS_PER_DOLLAR) : v) : 0;'],
  ['M19', 'two identical asset rows share one tick (the occurrence number is dropped)', 'src/hooks/inputRegister.js',
    "return { key: `A:${fp}${k > 1 ? `#${k}` : ''}`, fingerprint: fp };", 'return { key: `A:${fp}`, fingerprint: fp };'],
  ['M20', 'the totals row sums unrounded values, so it does not foot the cells shown', 'src/hooks/inputRegister.js',
    "['FMV', 'B0', 'annualExclusions', 'unrealizedGain', 'discountAmount', 'giftValue', 'taxableGift'], { cents: true });",
    "['FMV', 'B0', 'annualExclusions', 'unrealizedGain', 'discountAmount', 'giftValue', 'taxableGift']);"],
  ['M21', 'an error on the grantor ordinary stack is flagged on the federal rate only', 'src/hooks/inputRegister.js',
    "tauOrd: ['fedOrd', 'stateOrd', 'niit'],", "tauOrd: ['fedOrd'],"],
];

const only = new Set(process.argv.slice(2));
const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const results = [];
let restore = null;
process.on('SIGINT', () => { if (restore) restore(); process.exit(130); });

for (const [id, defect, file, target, replacement] of MUTATIONS) {
  if (only.size && !only.has(id)) continue;
  const path = join(ROOT, file);
  const original = readFileSync(path, 'utf8');
  const hits = original.split(target).length - 1;
  if (hits !== 1) { results.push({ id, defect, file, stale: true, hits }); console.log(`${id} STALE (target found ${hits}×) — ${defect}`); continue; }
  restore = () => writeFileSync(path, original);
  const t0 = Date.now();
  try {
    writeFileSync(path, original.replace(target, replacement));
    const ev = run('node', ['evals/run.mjs', '--quick', '--label', 'mutation-run']);
    const failing = [...(ev.stdout ?? '').matchAll(/^\s+\[(L\d[^\]]*)\] (.+?): (\d+) fail \/ (\d+)$/gm)].map((m) => ({ layer: m[1], check: m[2], fail: Number(m[3]) }));
    const ut = run('npx', ['vitest', 'run', 'src/engine/__tests__/', 'src/hooks/__tests__/']);
    const tests = /Tests\s+(.*)/.exec((ut.stdout ?? '') + (ut.stderr ?? ''))?.[1]?.trim() ?? null;
    const rec = { id, defect, file, caughtByEval: ev.status !== 0, evalFailingChecks: failing.length, evalExamples: failing.slice(0, 5), caughtByUnit: ut.status !== 0, unitTests: tests, seconds: (Date.now() - t0) / 1000 };
    results.push(rec);
    console.log(`${id} eval ${rec.caughtByEval ? 'CAUGHT' : 'missed'} (${failing.length} checks) | unit ${rec.caughtByUnit ? 'CAUGHT' : 'missed'} (${tests}) — ${defect}`);
  } finally {
    restore();
    restore = null;
  }
}
const live = results.filter((r) => !r.stale);
const summary = {
  mutations: live.length, stale: results.length - live.length,
  caughtByEval: live.filter((r) => r.caughtByEval).length, caughtByUnit: live.filter((r) => r.caughtByUnit).length,
  caughtByEither: live.filter((r) => r.caughtByEval || r.caughtByUnit).length,
};
console.log(`\n${summary.caughtByEither}/${summary.mutations} caught (eval ${summary.caughtByEval}, unit tests ${summary.caughtByUnit}); ${summary.stale} stale`);
mkdirSync(join(ROOT, 'evals', 'results'), { recursive: true });
// the committed record is a run of every mutation; a subset run writes beside it
writeFileSync(join(ROOT, 'evals', 'results', only.size ? 'mutation-subset.json' : 'mutation.json'), JSON.stringify({ summary, results }, null, 2));
process.exitCode = summary.caughtByEither === summary.mutations && summary.stale === 0 ? 0 : 1;
