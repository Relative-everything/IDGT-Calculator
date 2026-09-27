# Merge-readiness review: PR #3 (`claude/upbeat-noether-pxib59` → `main`)
Date: 2026-09-27. Head `b7c1270`, base `f09a5f2`, 6 commits, 7 files, `mergeable_state: clean`.
Method: 7 independent review lenses over the diff (workflow semantics, deploy scripts, security and
supply chain, dependencies, docs and governance, root-cause skeptic, merge-day operations), each
finding attacked by 3 refuters (reproduce / spec / impact); the review workflow lost its agent
budget after 20 of 57 agents (session limit), so 12 findings were adjudicated by the main session
with direct evidence. Every claim below was demonstrated by a command or read from a primary source.

**Status (2026-09-27): fixes applied on the branch in the commit that adds this file**, approved by the
owner: F1–F5 and F8–F16. F6 (no fork pull-request trigger) and F7 (major-tag pins) are accepted as is.
The "Fix before merge" list below is kept as the record of what that commit changed.

## Verdict
**Merge with conditions. Weighted score 8.1 / 10. No blocker.** Nothing confirmed would break CI,
break the deploy, leak, or publish wrong behaviour. Two findings are rated important; both are
documentation: an overstated premise and a missing warning for merge day.

| Criterion | Weight | Score |
|---|---|---|
| Deploy correctness on first `main` run | 30 | 8 |
| CI gating correctness | 15 | 9 |
| Security / token scope | 15 | 9 |
| Dependency change safety | 10 | 10 |
| Documentation accuracy | 15 | 6 |
| Operability / rollback | 10 | 7 |
| Process compliance | 5 | 8 |

## Conditions (in order)
1. Optional but recommended: the fix commit listed under "Fix before merge".
2. Settings → Pages → Build and deployment → Source → **GitHub Actions**. The page then suggests
   workflow templates; **do not click Configure** on any of them (F13).
3. Merge PR #3.
4. If the deploy job fails at job start with "Branch main is not allowed to deploy to
   github-pages": Settings → Environments → github-pages → Deployment branches → *Selected
   branches* containing only `main` (F5, N1). Not "All branches".
5. Close PR #1 (`claude/fix-calculator-compute-IcIjX`) as superseded: it conflicts with `main` and
   6 of its 11 files no longer exist (rebuild handback N9).

## Findings register
Status: **C** confirmed by ≥2 of 3 refuters · **R** refuted by ≥2 of 3 · **S** adjudicated by the
main session (direct evidence, no refuter budget).

| # | Sev. | Status | Location | Finding | Fix |
|---|---|---|---|---|---|
| F8 | important | S | `deploy.yml:3`, ROADMAP Phase 7, plan/handback | "`GITHUB_TOKEN` pushes to `gh-pages` would not publish" stated as fact. GitHub docs say so (reusable `actions-do-not-trigger-pages-rebuilds.md`); peaceiris/actions-gh-pages README (2026-07-16) says the token "works for deploying to GitHub Pages" after a first manual branch selection; JamesIves/github-pages-deploy-action documents branch-source + token write. Not testable from here. Mechanism unaffected; rationale overstated. | Soften to "GitHub's docs say…; popular push actions report it working; the Actions source was chosen as the documented flow with least privilege." |
| F13 | important | S | handback B1, plan B1, README | Settings → Pages → GitHub Actions suggests templates (docs line 62). `actions/starter-workflows pages/static.yml`: `branches: [$default-branch]`, environment `github-pages`, `path: '.'`. Clicking Configure adds a competing deploy of the repo root; source `index.html` references `/src/main.jsx` → blank page. | One sentence in B1 and README: skip the templates. |
| F4 | nit | C | `deploy.yml:93`, plan Departures | Worst case is 12 × 30 s + 11 × 10 s = 470 s (reproduced with a hanging stub), not "2 minutes"; plan's departure sentence is wrong; `timeout-minutes: 15` is the real bound. | Message "after 12 attempts"; fix the plan sentence. |
| F2 | nit | C | `deploy.yml:85` | Empty `page_url` → `origin=$(… grep …)` fails under `bash -e` with no `::error` line. OpenAPI marks `page_url` required, so practically unreachable. | Guard `PAGE_URL` like the hash. |
| F3 | nit | C | `deploy.yml:67` | If `gh api` itself fails (Pages disabled → 404, rate limit → 403), the step exits 1 with only gh's stderr, no Settings path. This repo has Pages enabled, so the real path prints the annotation. | `\|\| { echo "::error…"; exit 1; }` on the call. |
| F1 | important→nit | R | `deploy.yml:88` | Cache-buster reuses `GITHUB_RUN_ID`, so a re-run requests the same 12 URLs. Refuted: a job re-run re-executes `deploy-pages`, which creates a new Pages deployment (invalidating CDN copies) before the check runs. | Harmless improvement: add `${GITHUB_RUN_ATTEMPT}` to the key. |
| F5 | nit | S (1 refuter: stands) | handback N1 | The job `if` is not the enforcement; the environment's deployment-branch rule is. N1 tells the owner only to "allow main", not that the rule should be main-only (docs recommend it). | State the target: *Selected branches* = `main`. |
| F14 | nit | S | `deploy.yml:69` | Pre-flight says "re-run this job"; artifact `retention-days` defaults to 1, so after a day only "Re-run all jobs" works, else deploy-pages fails with "No artifacts named github-pages…". | Change the message to "Re-run all jobs". |
| F9 | nit | S | `deploy.yml:10` | `branches: ['**']` also matches `gh-pages` (no `package.json`) → any push there yields a red build. | `branches: ['**', '!gh-pages']` (docs: negation allowed; `branches-ignore` cannot be combined). |
| F15 | nit | S | handback line 49 | "If you merge before B1, the run fails at the pre-flight" is unconditional; an environment branch rule would fail the job before any step, with the N1 message. | Soften. |
| F16 | nit | S | handback "How to read" | Three quick merges leave the middle run `cancelled`; guidance covers only `skipped`. | One sentence. |
| F10 | nit | S | `src/CLAUDE.md:68` | "Current commit" still points at the rebuild handback. Governance file, outside the plan's named files. | Pointer to `2026-09-26-ci-deploy/handback.md` (owner decision). |
| F11 | nit | S | plan Reads, handback Summary | "12 commits behind": `rev-list --count` is 13 including the PR #2 merge; 12 is `--no-merges`. | "13 commits (12 non-merge)". |
| F12 | nit | S | handback Nits | "plan.md is 100 lines": committed file is 112. | "112 lines". |
| F6 | nit | S | `deploy.yml:9` | No `pull_request` trigger: fork PRs get no CI status. Strictly safer than running untrusted code; PR #3 is same-repo so push runs cover it. | None now; add `pull_request: {branches: [main]}` if outside contributions are expected. |
| F7 | nit | S | `deploy.yml:29` | Actions pinned to first-party major tags, not SHAs; the SHAs the runner resolved equal Vite's Renovate-maintained pins. | Accepted (no updater configured). |

## Checked and found sound (selection of 65 items across lenses)
- Live site forensics: `a8e6d32` build reproduces all five deployed blobs (`index.html` e94c928, JS da68e3d, CSS bc2745a, favicon, icons); four neighbouring commits do not. Only two workflows exist; no Pages build followed any `main` push after 2026-03-13.
- Permissions: build token `Contents: read, Metadata: read` (run log); deploy job `pages: write` + `id-token: write` = deploy-pages' documented minimum; `GET /pages` needs `pages:read`; `deploy-pages` lists artifacts via the runtime token, no `actions:` scope.
- Scripts: no `${{ }}` in any `run:`; extracted scripts pass under `/usr/bin/bash -e` in 14 live-check and 6 pre-flight scenarios; wrong base → 404 error naming `vite.config.js`; stale March content → exit 1 after 110 s.
- Concurrency: documented pattern; one running + one pending on `main`, newest always deploys; a `main` deploy is never cancelled mid-run.
- Artifact: `dist/` only (no source maps, no env values); `retention-days: 1`; name matches deploy-pages' default.
- Lockfile: 0 additions / 564 deletions; the 43 removed entries are gh-pages' closure minus 6 still-required packages; 0 dangling requirements; `npm ci --ignore-scripts` in a clean folder → 341 packages.
- Builds: JS byte-identical to `main`'s; CSS +2 unused rules (Tailwind scans docs; pre-existing, N2).
- Handback numbers: `npx vitest run` 97 passed / 1 skipped; engine defaults recomputed → $252,725 / year 17 / $485,988; remaining exclusion $15,000,000; Node 22 EOL 2027-04-30 per nodejs/Release schedule.json (N4 was labelled "from memory"; now sourced).
- sdlc-loop: plan committed (`7ffb455`) before the first edit (`795b1f8`); one edit class per commit; all handback template headings present; Departures match the diff.

## Not verifiable from this session
- Current Pages `build_type` and the `github-pages` environment's deployment-branch policy (API paths blocked by the proxy; no MCP endpoint). The pre-flight handles the first at runtime; N1 documents the second.
- Real Pages/CDN behaviour for query-string cache-busting and identity encoding (egress to `*.github.io` blocked).
- Whether a `GITHUB_TOKEN` push to `gh-pages` triggers a Pages build today (F8): documented "no", widely reported "yes".

## Fix before merge (cheap, clearly right)
1. `.github/workflows/deploy.yml`: soften the header comment (F8); `branches: ['**', '!gh-pages']` (F9); pre-flight `|| { … }` guard and "Re-run all jobs" wording (F3, F14); `PAGE_URL` guard (F2); `?v=${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-${attempt}` (F1); "after 12 attempts" (F4).
2. `docs/ROADMAP.md` Phase 7: same softening as F8.
3. `README.md` and `handback.md` B1: "skip the suggested templates" (F13); N1 target configuration (F5); 13 commits (F11); 112 lines (F12); pre-flight/environment wording (F15); cancelled runs (F16).
4. `plan.md` Departures: correct the "2 minutes" sentence (F4).
5. `src/CLAUDE.md:68` pointer (F10): outside the plan's named files; owner decision.
