# Handback: publish `main` to GitHub Pages from CI
Branch: `claude/upbeat-noether-pxib59`. Change: `docs/changes/2026-09-26-ci-deploy`. Tier: Lite.
Status: complete — takes effect after builder actions B1 (one Settings change) and B2 (merge).

## Summary
Asked: why the rebuilt calculator never reached the live site, and fix it. Cause: GitHub Pages
serves the `gh-pages` branch, which only a manual `npm run deploy` updates; it last ran 2026-03-14,
so the public site is `main@a8e6d32` (rebuilt byte for byte), 12 commits and the whole 2026-09-26
rebuild behind. Done: one workflow that lints, tests and builds every push and deploys `main`
through the GitHub Actions Pages source, stops with the exact Settings path if that source is not
set, and reads the live page back to prove it is this build; the dead `npm run deploy` path is
removed (43 packages, lockfile deletions only); README and ROADMAP updated. Verified: actionlint 0;
97 tests green locally and on GitHub (run 36270892227); 7 deploy-script scenarios pass or fail as
designed. Remaining: B1 and B2; the first run on `main` is the first real execution of the deploy job.

## What changed
- Merging to `main` publishes the site automatically, about a minute later, and only if lint,
  every test and the build pass. A failing test blocks the deploy and the site keeps its last version.
- Every push to any branch, including Claude session branches, runs the same checks, so a broken
  branch shows a red X before you merge it.
- If Pages is still set to "Deploy from a branch", the deploy stops and names the setting to change.
- After deploying, the workflow downloads the live page and fails unless it is byte-identical to the
  page it built and every script, stylesheet and icon it references loads. That catches both a
  stale site (today's failure) and a blank page from a wrong base path (the March failure).
- `npm run deploy` is gone. Manual redeploy: Actions → Build and deploy → Run workflow on `main`.
- The calculator itself is unchanged: its JavaScript is byte-identical to `main`'s build; the
  stylesheet gained one unused rule (Flag N2).

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
- If the deploy job fails with "Branch main is not allowed to deploy to github-pages": Settings →
  Environments → github-pages → Deployment branches → allow `main`, then re-run (Flag N1).
- If you merge before B1, the run fails at "Require the GitHub Actions Pages source". Do B1, then
  "Re-run all jobs": the uploaded site expires after one day, so re-running only the failed job can
  fail after that.
- If only the last step fails with "not serving this build's index.html after 2 minutes" while the
  live title is already correct, the CDN was slow; re-run. If it recurs, lengthen the loop (Nit 2).

## How to read the result
- "Deploy" green means GitHub accepted and published the artifact; `deploy-pages` waits for the
  deployment to report success (H, action behaviour).
- "Check the live site serves this build" green is independent evidence: the public `index.html`
  hash equals the build's and each referenced asset returns HTTP 200 (H).
- Estimates: the 2-minute CDN window (M); the site staying on the March build between B1 and the
  first deploy, since switching the source does not unpublish (M).
- Be skeptical of a run where "Deploy to GitHub Pages" shows skipped: that commit did not run on
  `main`, so nothing was published.

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
- Deploy-job scripts extracted verbatim from the YAML and run with `/usr/bin/bash -e`, the shell the
  run log shows for unmarked `run:` steps:
  - Pre-flight with a stubbed `gh`: `workflow` → exit 0; `legacy` → exit 1, "Pages builds from a
    branch (build_type=legacy). Set Settings → Pages → Build and deployment → Source to "GitHub
    Actions", then re-run this job."; API 404 → exit 1.
  - Live check against local static servers at `/IDGT-Calculator/`: new build → exit 0 (three 200s);
    build with `base: '/'` → exit 1, "…/assets/index-DRjH9d8L.js returned HTTP 404; check base in
    vite.config.js."; empty hash → exit 1; March `gh-pages` content, i.e. today's live site → exit 1
    after 111 s, "…is not serving this build's index.html after 2 minutes."
- Playwright (Chromium) on `vite preview` at `/IDGT-Calculator/`, 1280 px: title "IDGT Asset
  Analyzer", 91 table rows, unverified-mortality banner present, 0 console errors, 0 HTTP failures.
- Forensics: building `a8e6d32` yields `index-GOFK661_.js` with git blob `da68e3d`, identical to the
  deployed file; `5ddb1b5` → `index-D0PK9j1b.js`, `6564d38` → `index-i203tRMO.js`.
- Build diff, `main@f09a5f2` vs this branch: JS byte-identical; CSS differs by `.contents{display:contents}`.
- GitHub permission tables (github/docs `src/github-apps/data/fpt-2026-03-10`): GET `/repos/{o}/{r}/pages`
  needs `pages:read`; POST `…/pages/deployments` needs `pages:write`; PUT `…/pages` (changing the
  source) needs `pages:write` plus `administration:write`, which a workflow token cannot be granted.

## Self-review findings
### Important
None.

### Nits (showing 4 of 4)
- [Bugs] `.github/workflows/deploy.yml`, live-check step: `for path in $paths` is open to glob
  expansion; Vite asset paths contain no glob characters, so there is no effect today.
- [Bugs] Same step: the 2-minute window after `deploy-pages` succeeds is an estimate (M). A slow CDN
  purge would fail the step although the site updated; a re-run passes.
- [Compliance] `plan.md` is 100 lines against the 20–60 line Lite guide; the Reads block carries the
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
- CI pushes `dist/` to `gh-pages` with `GITHUB_TOKEN` (ROADMAP's original wording): GitHub documents
  that such pushes do not trigger a Pages build; it would reproduce today's silent staleness.
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

## Flags
### Blocking
- **B1 — Pages source.** The site cannot update until Settings → Pages → Build and deployment →
  Source is "GitHub Actions". The workflow cannot change it (the API call needs
  `administration:write`) and this session has no tool for it. Options: flip before merging (the
  first run deploys) or after (the first run stops at the pre-flight; flip, then Re-run all jobs).
  Recommendation: before merging.
- **B2 — Merge.** No PR was opened. Until `claude/upbeat-noether-pxib59` reaches `main`, the public
  URL keeps serving the March engine: $13,990,000 exclusion instead of $15,000,000 for 2026, an
  opt-in $7M TCJA-sunset toggle, and neither "Fix engine NPV logic" (`6564d38`) nor "Fix
  tax-exclusive gift benefit formula" (`318625d`). Recommendation: merge promptly; anyone using the
  link today sees numbers the repo has since marked wrong.

### Non-blocking
- **N1 — Environment rule.** The `github-pages` environment dates from the branch-source era and may
  only allow `gh-pages`; not inspectable from this session. Symptom and fix under "What to watch for".
- **N2 — Tailwind scans docs and YAML (pre-existing, out of scope).** `src/index.css` imports Tailwind
  with no `source(...)` limit, so text such as `contents: read` in this workflow emitted an unused
  `.contents` rule and changed both asset hashes. Harmless, but any doc edit can change the bundle.
  Proposal for the toolchain session: limit detection to `src/` with `source(...)` on the import and
  check the CSS returns to 22.39 kB (syntax to verify against Tailwind v4 docs; M).
- **N3 — `npm audit` (pre-existing).** 14 advisories, all dev tooling (1 critical: vitest 0.34.6);
  production dependencies 0. Belongs to ROADMAP Phase 7's toolchain half.
- **N4 — Node 22** reaches end of maintenance in April 2027 (M, Node.js release schedule, from
  memory); move the workflow to Node 24 with the toolchain half.
- **N5 — Stale governance line.** `src/CLAUDE.md` "NEXT SESSIONS ROADMAP" still lists "CI" as future
  work; only the toolchain half remains. Proposed edit: "CI" → "toolchain upgrade (Phase 7)". Not applied.
- **N6 — `gh-pages` branch.** Unused once B1 is done, but it is the rollback (switch the source back to
  serve the March build). Recommendation: delete it after a week of green deploys.
- **N7 — Process departures** are recorded in `plan.md` under Departures from plan.

## Next session should
1. Read this file, then open Actions → "Build and deploy" for the merge commit on `main`: both jobs
   green and the live title "IDGT Asset Analyzer". If the deploy job failed, its error names the fix (B1 or N1).
2. Run ROADMAP Phase 1 (verify the SSA life table), the largest open accuracy flag. It needs the
   published table supplied by you; read `docs/ROADMAP.md` Phase 1 first.
3. Run ROADMAP Phase 7's toolchain half (vitest 5, vite ≥ 8.0.16, audit clean, Node 24) with N2 and
   N5; read `docs/ROADMAP.md` Phase 7 and this file's Flags first.
