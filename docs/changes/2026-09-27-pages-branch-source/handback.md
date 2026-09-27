# Handback: deploy `main` under the Pages source the repository actually has
Branch: `claude/modest-hypatia-s1lf4a`. Change: `docs/changes/2026-09-27-pages-branch-source`. Tier: Lite.
Status: complete. Takes effect on merge; no settings change needed.

## Summary
Asked: the repo will not deploy; make it so a merge publishes the site. Cause: run 36333049468 on
`main@bc1ecd7` built and tested green, then its deploy job stopped at its own pre-flight because
Settings → Pages → Source is still "Deploy from a branch" (`gh-pages` /), not "GitHub Actions". A
workflow cannot change that setting (needs `administration: write`). Done: the workflow reads the source
and publishes through it. On a branch source it commits the tested build to `gh-pages` and requests a
Pages build through the API. The Actions-source path is kept. Verified locally (actionlint 0, every new
shell block in 17 scenarios, 214 tests, build, Chromium render) and on GitHub: run 36334052821 on this
branch read the real Pages API and routed to the branch path.

## What changed
- Merging to `main` now publishes the site whichever Pages source is set; about 2–3 minutes per run.
- New job "Pages source" runs on every push. It prints the source and which path a merge will use, and
  fails on a source the workflow cannot publish to, so a pull request shows that before merge.
- New job "Publish to the gh-pages branch": replaces `gh-pages`' files with the exact build the tests
  passed on, adds `.nojekyll`, commits on top of the existing history, then asks GitHub for a Pages
  build and waits for it. Only this job can write to the repository.
- "Check the live site" is now its own job after either path: the live `index.html` must be
  byte-identical to the build, and every script, stylesheet and icon it references must return 200.
- The calculator is unchanged: this branch changes only the workflow and documentation.

## After merge
1. Actions → Build and deploy → the run for the merge commit: five jobs. On today's setting "Deploy to
   GitHub Pages" shows skipped; that is expected.
2. A second run, "pages build and deployment", appears (GitHub's own), triggered by the build request.
3. When "Check the live site" is green, hard-reload the site (Ctrl+Shift+R or Cmd+Shift+R): Pages lets
   browsers cache HTML for 10 minutes, so a plain reload can still show the March build. The tab title
   changes from "idgt-calculator" (March build) to "IDGT Asset Analyzer".

## Verification output
| Check | Result |
|---|---|
| actionlint 1.7.12 with shellcheck | 0 findings |
| `npm ci`, eslint, vitest, vite build (Node 22.22.2) | 0 problems; 214 passed / 1 skipped; built |
| "Pages source" block, stubbed `gh`, 6 fixtures | workflow → actions; legacy `gh-pages` / → branch; legacy `main` /, legacy `gh-pages` /docs, no `html_url`, API error → exit 1 with the reason |
| Commit block vs a bare copy of the real `gh-pages` (72720f5) | new commit on top of 72720f5; tree = `dist/` byte for byte + `.nojekyll`; March assets and stray `.gitignore` removed; re-run with the same build → no commit |
| Build-request block, stubbed API, 6 sequences | old → queued → built(ours) pass; API hiccup then built pass; errored(ours) fail with GitHub's message; old errored then ours built pass; never reports ours → warning, pass to live check; request refused → fail |
| Live-check block vs local servers at `/IDGT-Calculator/` | this build pass; March build fail after 18 attempts; `base: '/'` build fail on the asset 404 |
| Chromium on the published bundle | title "IDGT Asset Analyzer", 8 tables, 0 console errors, 0 failed requests |
| GitHub run 36334052821 (this branch) | build green; "Pages source": `build_type=legacy source=gh-pages/` → branch; deploy, publish, live check skipped (not `main`) |
| Branch protection | `gh-pages` unprotected (GitHub branches API), so the CI push is not blocked |

## Residual risks
- The publish job first runs for real on `main`: it cannot run on a branch without publishing to the
  live site before the owner merges. Its scripts ran locally against the real branch history; the API
  calls follow GitHub's permission tables (confidence: high that the push works, medium-high that the
  build request is honoured, since GitHub documents it but it was not observed from here).
- If the `github-pages` environment was restricted to `main`, GitHub's own branch build is blocked; the
  publish job then fails on the errored build with GitHub's message. Fix: Settings → Environments →
  github-pages → allow `gh-pages`, or switch the source to GitHub Actions. (Low.)
- Rollback: revert the merge on `main` (redeploys the previous build), or `git revert` the deploy commit
  on `gh-pages`, whose history is kept.

## Next session should
Nothing is blocking. Optional: switch Source to "GitHub Actions" (no `contents: write` in CI, and no
build commits in git); the workflow follows the setting with no edit.
