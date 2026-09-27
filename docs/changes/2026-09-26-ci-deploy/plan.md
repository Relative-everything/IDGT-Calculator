# Plan: publish `main` to GitHub Pages from CI (ROADMAP Phase 7, CI half)
From: direct request ("why won't it deploy the newly built version? fix if possible"). Date: 2026-09-26.
Tier: Lite. Status: implemented 2026-09-26 (accepted same day — D1: GitHub Actions → Pages; D2: remove
`npm run deploy`). Handback: `handback.md`. Reviewed 2026-09-27 (`review.md`); the owner-approved
review fixes are recorded under Departures from plan.

## Reads
- `src/CLAUDE.md` — no CI or deploy rule; later sessions follow `docs/ROADMAP.md` under sdlc-loop.
- `docs/ROADMAP.md` — Phase 0 step 2 makes deploying a manual owner action (`npm run deploy`); Phase 7
  (Lite): "test + lint + build on every push, deploy `dist/` to `gh-pages` on `main`".
- `docs/changes/2026-09-26-idgt-rebuild/handback.md` — complete; "`npm run deploy` … not run this
  session"; "no CI workflows exist yet".
- `package.json`, `vite.config.js`, `index.html`, `.gitignore`, `README.md` — deploy is
  `gh-pages -d dist` after `predeploy` build; `base: '/IDGT-Calculator/'` matches `homepage` and the
  favicon path; `dist` is ignored; README lists `npm run deploy # gh-pages`.
- Remote refs and Actions API — no `.github/` on any branch; the only workflow is the dynamic
  `pages-build-deployment`: runs 6–7 built `gh-pages` (source = "Deploy from a branch: gh-pages"),
  last run 2026-03-14T18:00:55Z, none since.
- Forensic rebuild — `a8e6d32` reproduces the deployed `assets/index-GOFK661_.js` byte for byte
  (blob `da68e3d`); `5ddb1b5` and `6564d38` do not. Live site = `main@a8e6d32`, 13 commits behind (12 non-merge).
- Local checks on `main@f09a5f2` — `npm ci` ok; eslint 0; vitest 97 passed / 1 skipped; build ok.
- GitHub docs source (github/docs, 2026-09-25) — "Commits pushed by a GitHub Actions workflow that
  uses the `GITHUB_TOKEN` do not trigger a GitHub Pages build"; the documented custom-build flow is
  Source "GitHub Actions" → `upload-pages-artifact` → `deploy-pages`.
- `actions/deploy-pages` v5.0.1 README — with a branch source, deployments must originate from that
  branch unless the environment is protected; the job needs `pages: write` and `id-token: write`.
- Vite `docs/guide/static-deploy.md` — same flow; its sample pairs checkout v7, setup-node v7,
  upload-pages-artifact v5, deploy-pages v5. Tags read directly: checkout v7.0.1, setup-node v7.0.0,
  upload-pages-artifact v5.0.0, deploy-pages v5.0.1. Ubuntu 24.04 runner ships GitHub CLI 2.101.0.

## Root cause
Pages serves the `gh-pages` branch and only a manual `npm run deploy` writes to it. Nothing runs on
merge, so the rebuild merged in PR #2 was never published (ROADMAP Phase 0 step 2 was not run).

## Files that change
- `.github/workflows/deploy.yml` — new.
- `package.json`, `package-lock.json` — modified by `npm uninstall gh-pages`, plus removal of the
  `predeploy`/`deploy` scripts (D2).
- `README.md` — modified: Development block describes the CI deploy.
- `docs/ROADMAP.md` — modified: Phase 0 step 2 and Phase 7 record this change and the corrected premise.
- `docs/changes/2026-09-26-ci-deploy/plan.md`, `handback.md` — new.
- Added 2026-09-27 with the owner's approval: `src/CLAUDE.md` (Current-commit pointer and roadmap
  wording, review F10 and handback N5) and `docs/changes/2026-09-26-ci-deploy/review.md` (new).

## Order of work
1. Commit this plan; stop for acceptance.
2. Workflow (D1). Triggers: push to any branch, `workflow_dispatch`. Default permissions
   `contents: read`; one concurrency group per ref; superseded runs are cancelled except on `main`.
   - `build`: checkout without persisted credentials → Node 22 with npm cache → `npm ci` →
     `npm run lint` → `npm test -- --run` → `npm run build` → output the SHA-256 of `dist/index.html`
     → on `main` only, `upload-pages-artifact` from `dist`.
   - `deploy` (needs `build`; `main` only; environment `github-pages`; permissions `pages: write`,
     `id-token: write`; no checkout, no npm): pre-flight `gh api repos/{repo}/pages` must report
     `build_type: workflow`, else fail naming the setting → `deploy-pages` → poll the page URL (12 attempts,
     about 2 minutes) until its `index.html` hash equals the build's → require HTTP 200 for every
     site-absolute `src`/`href` it references (catches a wrong `base`).
3. `npm uninstall gh-pages`; delete the `predeploy` and `deploy` scripts (D2).
4. README Development block; ROADMAP Phase 0 step 2 and Phase 7 notes.
5. Gates 3–5.

## Golden values
None: no calculated, statutory or actuarial value is encoded. Literals, checked by inspection:
Node 22 satisfies Vite 8.0.0 and plugin-react 6.0.1 `engines` `^20.19.0 || >=22.12.0` (lockfile, H)
and is the version that passed locally (22.22.2). Action majors are from each repo's tags on
2026-09-26 (H). The 12-attempt poll (about 2 minutes; up to about 8 if every request times out) only absorbs CDN
refresh after `deploy-pages` reports success (M).

## Builder actions (outside the repo)
- B1. Settings → Pages → Build and deployment → Source → **GitHub Actions**, and skip the workflow
  templates that page suggests. Before merging is smoother; if you merge first, the run fails at the
  pre-flight with this instruction; then use "Re-run all jobs".
- B2. Merge. Acceptance (ROADMAP Phase 7): green run on `main`; live title "IDGT Asset Analyzer".

## Risks
- Riskiest: the `github-pages` environment dates from the branch-source era and may carry a branch
  rule that blocks `main` ("Branch main is not allowed to deploy to github-pages"). Fix: Settings →
  Environments → github-pages → Selected branches = `main` only. Cannot be inspected from this session.
- Until the first successful run, the site keeps serving the March build (M: switching the source
  does not unpublish).
- Rollback: revert on `main` (redeploys), or set Source back to the untouched `gh-pages` branch.
- Every push now spends 1–2 runner minutes; the repo is public, so there is no minutes cost.

## Rejected options
- CI pushes `dist/` to `gh-pages` with `GITHUB_TOKEN` (ROADMAP's wording): GitHub's docs say these
  pushes start no Pages build, while peaceiris/actions-gh-pages and JamesIves/github-pages-deploy-action
  report them working (unsettled from here, review F8). Rejected regardless: it needs `contents: write`
  in CI and keeps build commits in git, and the Actions source is the documented flow.
- The same push with a personal access token: builds trigger, but it needs a long-lived repo-write
  secret to create, store and rotate.
- Keep `npm run deploy` (D2 alternative): after B1 it pushes to a branch Pages no longer serves, a
  command that succeeds and publishes nothing.
- `actions/configure-pages`: here it only looks the site up and never checks the source setting; the
  pre-flight does.
- SHA-pinned actions (Vite pins with Renovate): no updater is configured here, so pins would age
  unnoticed; first-party actions only, pinned to major tags.
- Playwright in CI and Phase 7's toolchain half (vitest 5, vite ≥ 8.0.16, audit clean): separate
  edit classes, next session.

## Proof
- `actionlint .github/workflows/deploy.yml` → no findings.
- `npm ci`, `npx eslint .`, `npx vitest run`, `npx vite build` → 0 problems; 97 passed / 1 skipped; built.
- Smoke block extracted from the YAML, run against `vite preview`: exit 0 on the new build; non-zero
  on the March build (stale) and on a `base: '/'` build (asset 404).
- Pre-flight block with a stubbed `gh`: `workflow` → exit 0; `legacy` → exit 1 naming the setting.
- Playwright on the preview at `/IDGT-Calculator/`: 0 console errors, ranking table rendered.
- GitHub: this branch's push runs `build` green and skips `deploy`.

## Departures from plan
- Step 2: `curl --max-time 30` and `timeout-minutes: 15` on both jobs. They bound the step: 12
  attempts take about 2 minutes when requests fail fast and at most about 8 (12 × 30 s + 110 s) if every
  request times out; without them a hung request could hold the job for the 6-hour default. (First
  recorded as a 2-minute bound; corrected per review F4.)
- Step 2: the live check fails at once if the build job reported no hash, instead of polling for
  2 minutes against an empty value.
- Proof: the live check ran against local static servers rooted at `/IDGT-Calculator/` rather than
  `vite preview`, which cannot serve the stale and wrong-base cases; `vite preview` served the
  Playwright check. Scripts ran under `/usr/bin/bash -e`, the runner's shell per run 36270892227,
  after a first pass under `-eo pipefail` was found not to match it; results were the same.
- Bug-fix order: the regression check (live page equals build) was committed with the fix, since it
  runs only inside the deploy job. The failing state is recorded in Reads above (`7ffb455`) and was
  reproduced against the March build (exit 1 after 111 s).
- Review fixes, 2026-09-27, approved by the owner after `review.md`: workflow comment softened (F8);
  `gh-pages` excluded from the push trigger (F9); pre-flight annotates a failed `gh api` call and says
  "Re-run all jobs" and "skip the suggested templates" (F3, F13, F14); live check guards an empty page
  URL (F2), adds `GITHUB_RUN_ATTEMPT` to the cache-busting key (F1) and reports "after 12 attempts" (F4);
  README, ROADMAP, `src/CLAUDE.md`, this plan and the handback corrected (F5, F8, F10–F13, F15, F16).
