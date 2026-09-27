#!/usr/bin/env node
// IDGT calculator evals — command line. See evals/README.md.
//
//   node evals/run.mjs [--label pass2] [--n 1500] [--seed 20260927] [--quick]
//
// Prints the per-layer scorecard and every failing check with its first example; exit code 1 on any failure.
import { runEvals, DEFAULT_SEED } from './suite.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] == null ? true : arr[i + 1]] : null)).filter(Boolean));
const quick = Boolean(args.quick);
const res = await runEvals({ label: args.label ?? 'run', n: args.n != null ? Number(args.n) : undefined, seed: Number(args.seed ?? DEFAULT_SEED), quick });
const { summary, failing } = res;
const fmt = (x) => (typeof x === 'number' ? (Math.abs(x) >= 1000 ? x.toFixed(2) : x.toPrecision(10)) : String(x));

console.log(`\nIDGT calculator evals — ${summary.label} (seed ${summary.seed}, ${summary.seconds.toFixed(1)} s, pipeline: ${summary.pipeline})`);
console.log(`Scenarios: ${summary.personas} personas + ${summary.sweep} sweep → ${summary.scenariosEvaluated} evaluated, ${summary.scenariosRejected} rejected by validation; ${summary.handCases} hand calculations`);
for (const [name, L] of Object.entries(summary.layers).sort()) {
  console.log(`  ${name.padEnd(26)} ${String(L.checks - L.failingChecks).padStart(4)}/${String(L.checks).padEnd(4)} checks pass   ${String(L.assertions - L.failures).padStart(7)}/${L.assertions} assertions`);
}
console.log(`  TOTAL                      ${summary.totals.checks - summary.totals.failingChecks}/${summary.totals.checks} checks, ${summary.totals.assertions - summary.totals.failures}/${summary.totals.assertions} assertions; ${summary.scenariosWithAnyFailure} scenarios with ≥ 1 failure`);
for (const b of res.blocked) console.log(`  BLOCKED [${b.layer}] ${b.name} — ${b.reason}`);
if (failing.length) {
  console.log('\nFailing checks:');
  for (const c of failing) {
    console.log(`  [${c.layer}] ${c.name}: ${c.fail} fail / ${c.pass + c.fail}`);
    console.log(`      e.g. ${JSON.stringify(c.examples[0], (k, v) => (typeof v === 'number' ? Number(fmt(v)) : v))}`);
  }
}
process.exitCode = failing.length ? 1 : 0;
