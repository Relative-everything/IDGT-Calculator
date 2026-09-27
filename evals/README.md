# Eval suite — IDGT calculator math

```
npm run eval                                   # full: 16 personas + 1,500-scenario sweep, ≈ 40 s
node evals/run.mjs --label holdout --seed 4242 --n 2000
node evals/run.mjs --quick                     # ≈ 9 s; also runs inside `npm test` (evals/evals.test.js)
```
Results land in `evals/results/<label>.json` (scorecard, every failing check with its first examples, blocked
checks, discontinuities found, per-tag failure rates, the control-by-control wiring table). Committed runs:
`pass1.json` (the build as found), `pass2.json` (after the fixes), `holdout.json` (fixed build, unseen seed).
Findings and fixes: [`docs/changes/2026-09-27-math-evals/`](../docs/changes/2026-09-27-math-evals/).

## Why this design

A financial calculator is deterministic, so every grade here is **code-based** (numeric tolerance or exact
match). There is no model or human judgement in the loop, which makes the suite cheap enough to run thousands of
client files on every push. The design follows the principles in Anthropic's evaluation guidance ("Define your success
criteria", "Create strong empirical evaluations" in the Claude docs; not re-fetched this session because the
environment blocks docs.anthropic.com). Each principle maps to a mechanism here:

| Principle | How it is applied here |
|---|---|
| Specific, measurable success criteria, set before running | money within $0.01 + 1e-11 × scale; ratios within 1e-9; s\* equal or a documented tie; every toggle moves exactly the outputs it should |
| Task-specific cases that mirror the real distribution, edge cases included | 16 named client files (founder pre-IPO, exhausted-exclusion widow, NY/CA ING, terminal diagnosis, illiquid grantor, …) plus a seeded, stratified sweep over estate bands, prior-gift histories, 9 asset archetypes and every toggle |
| Many automatically graded cases beat a few hand-graded ones | ≈ 168,000 assertions per full run; hand calculations reserved for anchoring the oracle |
| The reference must be independent of the system under test | clean-room oracle (below). The repo's earlier "independent" reference scripts transcribed the same spec, so they inherited its error; finding F1 went undetected until a structurally different oracle was used |
| Grade the graders | the hand calculations grade the oracle as well as the engine; grader expectations that were wrong were fixed and recorded (findings.md, "Grader calibration") |
| Guard against overfitting | fixes were made against seed 20260927 and confirmed on an unseen seed (4242, 2,000 scenarios) |
| Regressions stay caught | each finding is pinned by a unit test that fails on the pre-fix code; a quick run of this suite is part of `npm test` |
| Never report a check you could not run as a pass | the mortality-table provenance check is reported BLOCKED until the SSA table can be verified |

## The six layers

| Layer | What it checks | Grader |
|---|---|---|
| **L1 hand calculations** (`scenarios/handcalc.js`) | 13 cases small enough to do on paper — fully taxable / below exclusion / deathbed swap / gift tax with and without §2035(b) / two-year life table / ING rate saving / ING fee liquidation / burn share 0% / §1015(d)(6) with annual exclusions / discount at death / unfundable swap. Each has its derivation written out line by line | engine AND oracle vs the closed form |
| **L2 oracle agreement** (`oracle/`) | every scenario: derived gift facts, horizon, q_t, the whole NPV-by-swap-year curve and feasibility, s\*, NPV(none), NPV(s\*), deathbed value, efficiency ratios, 14 ledger columns per death year for no swap and s\*, and the ING NPV, Δ versus the IDGT, verdict and ledger | engine vs oracle |
| **L3 invariants & theorems** | NPV(s\*) ≥ NPV(none); components sum to NPV; the ING bridge closes; a swap cannot affect earlier deaths; Σq = 1; warnings fire iff their condition holds (illiquidity, built-in loss, fee-driven liquidation, …); what the UI says about the deathbed value is true | logical |
| **L4 metamorphic** | ×3 every dollar input ⇒ ×3 every NPV; toggles that must be inert in a configuration are inert (discount-at-death with no discount, sale toggles with no sale, prior-gift exclusion with no prior gifts, neutral custom swap ≡ default, ING fields never touch the IDGT, display horizon never touches NPVs, NY/CA flag at 0% state); **discontinuity scans**: NPV(none) and the ING NPV are continuous in 14 continuous inputs — a jump that survives bisection to a 1e-12-wide interval is a defect | relational |
| **L5 UI wiring** | every UI field mapped to the engine exactly as its label and tooltip say (independent mapping in `oracle/ui.js`); 50+ controls each moved on a state where it should matter (or must not) through the app's own pipeline (`src/hooks/computeModel.js`), and the moved state re-checked against the oracle; portfolio ranking under both rank keys | sensitivity + oracle |
| **L6 breakevens & data** | each breakeven's final bracket straddles a sign change of the oracle's Δ and the reported winning side matches; grid cells equal the oracle's Δ; the basic exclusion table against the revenue procedures; mortality-table plausibility and provenance | oracle + reference data |

## The clean-room oracle (`oracle/`)

Written from the Internal Revenue Code and regulations, not from `docs/changes/*/model.md` and importing nothing from
`src/engine`:

- **Statute layer** (`statute.js`): §2001(c) tentative tax from the full bracket schedule; §2502/§2505 gift tax period by
  period with the credit of each gift year; §2001(b) estate tax with gift tax payable at date-of-death rates
  (§2001(g)(1)) and the Reg. §20.2010-1(c) anti-clawback credit; §1015(d)(6) per Reg. §1.1015-5(c). The engine instead
  uses an algebraic "taxable base" (flat τ_e above the exclusion, constants cancelled). Agreement on thousands of
  scenarios, including prior gifts from 2011–2025, gift-tax-paid histories and legislative exclusions, is the proof
  that the shortcut is exact.
- **Worlds** (`worlds.js`): keep / gift to the IDGT / ING as sets of lots (value, basis, owner). The owner decides who
  pays the tax on each lot's income (grantor, grantor trust with a reimbursement share, non-grantor trust) and how death
  values it (§1014 step-up vs Rev. Rul. 2023-2 carryover). Where the calculator has a documented convention (C-1…C-9,
  N-1…N-8) the oracle implements it from its plain-English statement and says so, so a difference is either an error
  or a convention worth revisiting — never ambiguous.
- **Evaluation** (`evaluate.js`): life-table death distribution, NPV, the stated swap tie rule, deathbed value,
  efficiency, ING comparison, ranking.

## Tolerances
Money: |engine − oracle| ≤ $0.01 + 1e-11 × (other estate + FMV + largest heir wealth). Ratios: 1e-9 relative.
Probabilities: 1e-15. s\*: equal, or the engine's year is within the documented tie tolerance (1e-6 × |NPV|) of the
oracle's optimum. Discontinuity: a jump > $1 that survives 60 bisection steps.

## Extending
Add a hand case to `scenarios/handcalc.js` for any new mechanism before building it; add its inputs to the generator's
archetypes or toggles; add a control row to `CONTROLS` in `suite.js` for any new UI field (on a state where it must
matter, and one where it must not).
