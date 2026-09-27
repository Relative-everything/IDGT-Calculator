# Handback: publish `main` to GitHub Pages from CI
Branch: `claude/upbeat-noether-pxib59`. Change: `docs/changes/2026-09-26-ci-deploy`. Tier: Lite.
Status: complete — takes effect after builder actions B1 (one Settings change) and B2 (merge).

## Summary
Asked: why the rebuilt calculator never reached the live site, and fix it. Cause: GitHub Pages
serves the `gh-pages` branch, which only a manual `npm run deploy` updates; it last ran 2026-03-14,
so the public site is `main@a8e6d32` (rebuilt byte for byte), 13 commits (12 non-merge) and the whole
2026-09-26 rebuild behind. Done: one workflow that lints, tests and builds every push and deploys `main`
through the GitHub Actions Pages source, stops with the exact Settings path if that source is not
set, and reads the live page back to prove it is this build; the dead `npm run deploy` path is
removed (43 packages, lockfile deletions only); README and ROADMAP updated. Verified: actionlint 0;
97 tests green locally and on GitHub (run 36270892227); 7 deploy-script scenarios pass or fail as
designed. A merge-readiness review on 2026-09-27 (`review.md`: 16 findings, 0 blockers, 2 important, both
documentation) led to one owner-approved fix commit, re-verified in 11 script scenarios. Remaining: B1
and B2; the first run on `main` is the first real execution of the deploy job.

## What changed
- Merging to `main` publishes the site automatically, about a minute later, and only if lint,
  every test and the build pass. A failing test blocks the deploy and the site keeps its last version.
- Every push to any branch, including Claude session branches, runs the same checks, so a broken
  branch shows a red X before you merge it.
- If Pages is still set to "Deploy from a branch", the deploy stops and names the setting to change.
- After deploying, the workflow downloads the live page and fails unless it is byte-identical to the
  page it built and every script, stylesheet and icon it references loads. That catches both a
  stale site (today's failure) and a blank page from a wrong base path (the March failure).
- Pushes to the `gh-pages` branch (built files only) no longer start a CI run.
- `npm run deploy` is gone. Manual redeploy: Actions → Build and deploy → Run workflow on `main`.
- The calculator itself is unchanged: its JavaScript is byte-identical to `main`'s build; the
  stylesheet gained two unused rules (Flag N2).

## What to watch for
- After B1 and B2: Actions → "Build and deploy" on `main` shows both jobs green, and the deploy job's
  last step prints three lines starting `200` (favicon, JS, CSS).
- Live page title reads "IDGT Asset Analyzer" (the March build says "idgt-calculator").
- Ranking panel reads "Remaining exclusion: $15,000,000". The March engine hard-codes $13,990,000,
  the 2025 figure, and still offers a $7,000,000 "TCJA sunset" toggle; seeing either means the old
  build is still being served.
- Default growth-stock row: NPV no swap $252,725; best swap year 17, $485,988 — the values the
  rebuild handback lists, so the reviewed engine is the one that went live.
- The "Mortality table unverified" banner is visible (expected until ROADMAP Phase 1).
- When you set Source to GitHub Actions, that page suggests workflow templates (Static HTML, Jekyll
  and others). Don't click Configure on any: this branch's workflow is the deploy, and the Static HTML
  template would publish the unbuilt repository root (a blank page) on every push to `main`.
- If the deploy job fails with "Branch main is not allowed to deploy to github-pages": Settings →
  Environments → github-pages → Deployment branches and tags → Selected branches, containing only
  `main` (not All branches: this rule is what stops other branches from publishing), then Re-run all
  jobs (Flag N1).
- If you merge before B1, the run fails at "Require the GitHub Actions Pages source" (or, if the
  environment restricts branches, at job start with the N1 message). Do B1, then
  "Re-run all jobs": the uploaded site expires after one day, so re-running only the failed job can
  fail after that.
- If only the last step fails with "not serving this build's index.html after 12 attempts" while the
  live title is already correct, the CDN was slow; Re-run all jobs (each re-run uses fresh cache-busting
  URLs). If it recurs, lengthen the loop (Nit 2).

## How to read the result
- "Deploy" green means GitHub accepted and published the artifact; `deploy-pages` waits for the
  deployment to report success (H, action behaviour).
- "Check the live site serves this build" green is independent evidence: the public `index.html`
  hash equals the build's and each referenced asset returns HTTP 200 (H).
- Estimates: the 12-attempt CDN window, about 2 minutes when requests fail fast and up to about 8 when
  each times out (M); the site staying on the March build between B1 and the
  first deploy, since switching the source does not unpublish (M).
- Be skeptical of a run where "Deploy to GitHub Pages" shows skipped: that commit did not run on
  `main`, so nothing was published. A run on `main` that shows cancelled was superseded by a newer
  push while queued; the newest run is the one that published.

## Verification output
- `actionlint .github/workflows/deploy.yml` (1.7.12 with shellcheck 0.11.0) → no output, exit 0.
  Negative controls: misspelled step id → 2 errors, exit 1; unquoted `$GITHUB_OUTPUT` → SC2086, exit 1.
- `npm ci` → added 341 packages (rebuild handback: 384; 384 − 43 = 341).
- `npx eslint .` → 0 problems.
- `npx vitest run` → Test Files 6 passed (6); Tests 97 passed | 1 skipped (98).
- `npx vite build` → `index.html` 0.72 kB; `index-CfFX7qgE.css` 22.42 kB; `index-DRjH9d8L.js`
  266.30 kB; built in 218 ms.
- GitHub run 36270892227 (push, `c5bc7e6`): "Lint, test, build" success in 20 s (Node v22.23.2,
  npm 10.9.8, 341 packages, 97 passed | 1 skipped, same asset names as the local build); "Upload site"
  skipped; "Deploy to GitHub Pages" skipped (not `main`).
- Deploy-job scripts, final version, extracted verbatim from the YAML and run on 2026-09-27 with
  `/usr/bin/bash -e`, the shell the run log shows for unmarked `run:` steps (the first version passed
  the equivalent 7 scenarios on 2026-09-26):
  - Pre-flight with a stubbed `gh`: `workflow` → exit 0; `legacy` → exit 1, "Pages is not set to build
    from GitHub Actions (build_type=legacy). Set Settings → Pages → … Source to "GitHub Actions" and
    skip the suggested templates, then use "Re-run all jobs" …"; `null` → exit 1, same message;
    API 404 → exit 1, "Could not read the Pages settings. Check that Pages is enabled under Settings → Pages."
  - Live check against local servers at `/IDGT-Calculator/`: new build → exit 0 (three 200s); build
    with `base: '/'` → exit 1, "…/assets/index-Dd7pxBcA.js returned HTTP 404; check base in
    vite.config.js."; empty hash → exit 1; empty page URL → exit 1, "deploy-pages did not report the
    page URL."; March `gh-pages` content behind a caching proxy → exit 1 after 110 s, "…after 12
    attempts."; site then updated, re-run with the same run attempt → exit 1 (12 cached stale copies,
    the review's F1 case); re-run with `GITHUB_RUN_ATTEMPT=2` → exit 0 on the first request.
- Playwright (Chromium) on `vite preview` at `/IDGT-Calculator/`, 1280 px: title "IDGT Asset
  Analyzer", 91 table rows, unverified-mortality banner present, 0 console errors, 0 HTTP failures.
- Forensics: building `a8e6d32` yields `index-GOFK661_.js` with git blob `da68e3d`, identical to the
  deployed file; `5ddb1b5` → `index-D0PK9j1b.js`, `6564d38` → `index-i203tRMO.js`.
- Build diff, `main@f09a5f2` vs this branch's final commit: JS byte-identical; CSS 22.39 → 22.45 kB, adding only
  `.contents{display:contents}` and `.visible{visibility:visible}` (asset names above are from `c5bc7e6`).
- GitHub permission tables (github/docs `src/github-apps/data/fpt-2026-03-10`): GET `/repos/{o}/{r}/pages`
  needs `pages:read`; POST `…/pages/deployments` needs `pages:write`; PUT `…/pages` (changing the
  source) needs `pages:write` plus `administration:write`, which a workflow token cannot be granted.

## Self-review findings
### Important
None.

### Nits (showing 4 of 4)
- [Bugs] `.github/workflows/deploy.yml`, live-check step: `for path in $paths` is open to glob
  expansion; Vite asset paths contain no glob characters, so there is no effect today.
- [Bugs] Same step: the 12-attempt window after `deploy-pages` succeeds is an estimate (M). A slow CDN
  purge would fail the step although the site updated; a re-run passes.
- [Compliance] `plan.md` is 126 lines against the 20–60 line Lite guide; the Reads block carries the
  forensic evidence the next session needs.
- [Compliance] Bug-fix ordering: the regression check (live page equals build) was committed with
  the fix, not before it, because it can only run inside the deploy job. The failing state was
  recorded in `plan.md` (`7ffb455`) before the fix and reproduced against the March build (exit 1).

### Looked for and did not find
- Expression injection: no `${{ }}` inside any `run:` script; values reach scripts through `env`.
- Token exposure: the build job has `contents: read` and does not persist credentials; only the
  deploy job holds write scopes (`pages`, `id-token`) and it runs no repository or npm code.
- Secrets, tokens or client data in the diff or logs: none; `GH_TOKEN` is masked by the runner.
- Fork or `pull_request_target` triggers: none. Deploys from refs other than `main`: blocked by the job `if`.
- Regressions: JS bundle byte-identical; 97 passed / 1 skipped and lint 0 unchanged; lockfile diff
  0 additions, 564 deletions; `npm ci` clean on the runner.
- Leftover references to `npm run deploy` or `gh-pages` outside historical change folders: only the
  workflow's explanatory comment.
- New dependencies: none. Removed: `gh-pages` and 42 transitive packages. Actions used, all
  first-party: checkout v7, setup-node v7, upload-pages-artifact v5, deploy-pages v5.
- Money arithmetic, golden values, baselines, tax characterizations: none touched.

## Rejected options
- CI pushes `dist/` to `gh-pages` with `GITHUB_TOKEN` (ROADMAP's original wording): GitHub's docs say
  such pushes start no Pages build, while peaceiris/actions-gh-pages and JamesIves/github-pages-deploy-action
  report them working (unsettled from here, review F8). Rejected regardless: it needs `contents: write`
  in CI and keeps build commits in git, and the Actions source is the documented flow.
- The same push with a personal access token: builds would trigger, at the cost of a long-lived
  repo-write secret to create, store and rotate.
- Keeping `npm run deploy` (builder chose removal): under the Actions source it pushes to a branch
  nothing serves and reports success.
- `actions/configure-pages`: only looks the site up here and never checks the source setting.
- SHA-pinned actions: no Dependabot or Renovate is configured, so pins would age unnoticed.
- `shell: bash` (adds `pipefail`) on every step: the scripts were verified under the default `bash -e`
  and do not depend on it.
- Publishing the new build to `gh-pages` from this session to fix the live site today: it writes
  outside the session branch without your merge, and B1 + B2 publish it anyway.
- Playwright in CI and Phase 7's toolchain half: separate edit classes.
- A `pull_request` trigger: same-repository branches are covered by push runs; pull requests from
  forks get no status (review F6), acceptable while there are no outside contributors.

## Flags
### Blocking
- **B1 — Pages source.** The site cannot update until Settings → Pages → Build and deployment →
  Source is "GitHub Actions". The workflow cannot change it (the API call needs
  `administration:write`) and this session has no tool for it. Options: flip before merging (the
  first run deploys) or after (the first run stops at the pre-flight; flip, then Re-run all jobs).
  Skip the workflow templates the settings page then suggests. Recommendation: before merging.
- **B2 — Merge PR #3**, which you opened on 2026-09-27. Until `claude/upbeat-noether-pxib59` reaches `main`, the public
  URL keeps serving the March engine: $13,990,000 exclusion instead of $15,000,000 for 2026, an
  opt-in $7M TCJA-sunset toggle, and neither "Fix engine NPV logic" (`6564d38`) nor "Fix
  tax-exclusive gift benefit formula" (`318625d`). Recommendation: merge promptly; anyone using the
  link today sees numbers the repo has since marked wrong.

### Non-blocking
- **N1 — Environment rule.** The `github-pages` environment dates from the branch-source era and may
  only allow `gh-pages`; not inspectable from this session. Symptom and fix under "What to watch for".
  Target configuration: Selected branches containing only `main`. The job's `if` only avoids a failed
  run; this rule is what stops another branch's copy of the workflow from publishing.
- **N2 — Tailwind scans docs and YAML (pre-existing, out of scope).** `src/index.css` imports Tailwind
  with no `source(...)` limit, so `contents: read` in this workflow and the word "visible" in this
  file emitted unused `.contents` and `.visible` rules and changed both asset hashes. Harmless, but any doc edit can change the bundle.
  Proposal for the toolchain session: limit detection to `src/` with `source(...)` on the import and
  check the CSS returns to 22.39 kB (syntax to verify against Tailwind v4 docs; M).
- **N3 — `npm audit` (pre-existing).** 14 advisories, all dev tooling (1 critical: vitest 0.34.6);
  production dependencies 0. Belongs to ROADMAP Phase 7's toolchain half.
- **N4 — Node 22** reaches end of life on 2027-04-30 (H, nodejs/Release `schedule.json`); move the
  workflow to Node 24 with the toolchain half.
- **N5 — Stale governance lines (fixed 2026-09-27 at your request).** `src/CLAUDE.md` "Current commit"
  now points at this handback and the rebuild handback; the roadmap line says "toolchain upgrade"
  instead of "CI".
- **N6 — `gh-pages` branch.** Unused once B1 is done, but it is the rollback (switch the source back to
  serve the March build). Recommendation: delete it after a week of green deploys.
- **N7 — Process departures** are recorded in `plan.md` under Departures from plan.
- **N8 — Review.** `review.md` holds the merge-readiness review: 16 findings, 0 blockers, 2 important
  (both documentation). All fixed in the review-fix commit except F6 (no fork pull-request trigger) and
  F7 (actions pinned to major tags, not SHAs), which stay as accepted choices.
- **N9 — PR #1** (`claude/fix-calculator-compute-IcIjX`) conflicts with `main`, and 6 of its 11 files no
  longer exist. Close it as superseded (your action; also flagged N9 in the rebuild handback).

## Next session should
1. Read this file, then open Actions → "Build and deploy" for the merge commit on `main`: both jobs
   green and the live title "IDGT Asset Analyzer". If the deploy job failed, its error names the fix (B1 or N1).
2. Run ROADMAP Phase 1 (verify the SSA life table), the largest open accuracy flag. It needs the
   published table supplied by you; read `docs/ROADMAP.md` Phase 1 first.
3. Run ROADMAP Phase 7's toolchain half (vitest 5, vite ≥ 8.0.16, audit clean, Node 24) with N2 and
   N5; read `docs/ROADMAP.md` Phase 7 and this file's Flags first.
