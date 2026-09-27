// The eval suite in CI: a reduced sweep (quick mode, ≈ 20–25 s) must pass every check. The full sweep is `npm run eval`.
// Methodology: evals/README.md. A failure here prints the check and its first failing scenario.
import { describe, it, expect } from 'vitest';
import { runEvals } from './suite.js';

describe('eval suite (quick): engine = clean-room oracle, hand calculations, invariants, metamorphic, UI wiring', () => {
  it('every check passes', async () => {
    const { summary, failing } = await runEvals({ label: 'ci', quick: true, write: false });
    const report = failing.map((c) => `[${c.layer}] ${c.name}: ${c.fail}/${c.pass + c.fail} — e.g. ${JSON.stringify(c.examples[0])}`).join('\n');
    expect(report, report).toBe('');
    expect(summary.scenariosEvaluated).toBeGreaterThan(150);
  }, 120_000);
});
