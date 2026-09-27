# Plan: deploy `main` under the Pages source the repository actually has
From: direct request, 2026-09-27: "this repo will not deploy; solve it so I just hit merge and reload".
Tier: Lite. Status: implemented 2026-09-27 on `claude/modest-hypatia-s1lf4a`; handback `handback.md`.
Amends `docs/changes/2026-09-26-ci-deploy` (it rejected the branch-publish option below; the owner's
merge-only constraint reverses that).

## Reads
- Run 36333049468 (`main@bc1ecd7`, merge of PR #3): `build` green; `deploy` failed at its pre-flight with
  "Pages is not set to build from GitHub Actions (build_type=legacy)". Deploy and live check skipped.
- Pages history: the dynamic `pages-build-deployment` last built `gh-pages@72720f5` on 2026-03-14, so the
  source is "Deploy from a branch", `gh-pages` / (root). `gh-pages` holds the March build (3 commits:
  `index.html`, `assets/index-GOFK661_.js`, `assets/index-nqMpL4T3.css`, icons, a stray `.gitignore`).
- Permission tables, github/docs `src/github-apps/data/fpt-2026-03-10/server-to-server-permissions.json`:
  PUT `/repos/{o}/{r}/pages` (changing the source) needs `administration: write` in addition to `pages`,
  which `GITHUB_TOKEN` cannot be granted; GET `/pages` and GET `/pages/builds/latest` need `pages: read`;
  POST `/pages/builds` needs `pages: write` only.
- github/docs `data/reusables/actions/actions-do-not-trigger-pages-rebuilds.md`: "Commits pushed by a
  GitHub Actions workflow that uses the `GITHUB_TOKEN` do not trigger a GitHub Pages build."
- REST description (github/rest-api-description): POST `/pages/builds` requests a build "without an
  additional commit"; builds are queued one at a time per repository.
- github/docs "Configuring a publishing source": external CI that commits built output to `gh-pages` with a
  `.nojekyll` file is a supported branch-source flow; Pages then skips the Jekyll build step.
- `actions/deploy-pages` README: with a branch source, a deployment must originate from that branch unless
  the environment is protected; so deploying from `main` with a branch source is not a dependable path.
- Action tags (git ls-remote, 2026-09-27): download-artifact v8.0.1, upload-pages-artifact v5.0.0 (tar of
  the directory, hidden files excluded, zipped as artifact `github-pages`), checkout v7.0.1.

## Root cause
The workflow deploys only through the "GitHub Actions" Pages source and stops when the source is
anything else. The source is still "Deploy from a branch" (the prior plan's builder action B1 was not
done), and a workflow cannot change it. So every merge fails to publish.

## Decision
Publish through the source that is configured; do not require a settings change.
- New `source` job (every push, `pages: read`): reads `build_type` and `source`. `workflow` → mode
  `actions`; `legacy` on `gh-pages` / → mode `branch`; anything else fails, on branch pushes too, so a
  pull request shows it before merge. Only `gh-pages` is accepted: publishing built files onto a branch
  that holds source code (e.g. `main`) would destroy it.
- `deploy` (mode `actions`, `main`): `deploy-pages`, unchanged except that the pre-flight moved to `source`.
- New `publish` (mode `branch`, `main`; the only job with `contents: write`): check out `gh-pages`, replace
  its tree with the build job's own artifact plus `.nojekyll`, commit on top of the history (rollback
  stays possible), push; then POST `/pages/builds` and poll `/pages/builds/latest` for this commit:
  `errored` fails with GitHub's message, `built` passes, no answer in 60 polls is only a warning.
- `verify` (after either path): the existing live-site check, now reading the URL from `source`; 18
  attempts instead of 12 to cover a branch build's CDN refresh.

## Rejected options
- Ask the owner to switch Source to "GitHub Actions" and re-run: works with no code change, but it is
  the step that was not taken, and the owner asked for merge-only. The workflow still supports it.
- `deploy-pages` from `main` while the source is a branch: allowed only if the `github-pages`
  environment is protected, which cannot be inspected from here; and it would fail again without
  telling us why.
- Push to `gh-pages` and rely on that push to start the build: GitHub's docs say it does not. The API
  request removes the dependence; a duplicate build, if the push does start one, is harmless.
- Force-push an orphan commit (peaceiris `force_orphan`): discards the deploy history that makes a
  rollback one `git revert` away.
- Third-party push actions (peaceiris, JamesIves): same result with a repo-write token handed to
  non-GitHub code; plain `git` needs about 15 lines.
- Rebuild inside `publish`: would publish bytes other than the ones tested and hashed.

## Golden values
None: no calculated, statutory or actuarial value is encoded.

## Proof (see handback)
actionlint with shellcheck; each `run:` block extracted from the YAML and run under `/usr/bin/bash -e`
(the runner's shell) against stubbed `gh`, a bare copy of the real `gh-pages` history and local static
servers; `npm ci`, eslint, vitest, vite build; the branch's own CI run exercises `source` against the
real Pages API.

## Risks
- The `publish` path first runs for real on `main` after merge (it cannot run on a branch without
  publishing an unreviewed build). Every script in it ran locally; the API behaviour is from GitHub's docs.
- If the `github-pages` environment was edited to allow only `main`, the branch-source build (which runs
  from `gh-pages`) is blocked; `publish` then fails on the `errored` build with GitHub's message. (Low.)
- A push to `gh-pages` by anyone between checkout and push makes the push fail (non-fast-forward); a
  re-run fixes it. Runs on `main` are serialised by the concurrency group.
