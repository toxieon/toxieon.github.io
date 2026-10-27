# Releasing a Neill Data change

Two scripts cover the release checklist. Both use Node built-ins only.

## The release rules

Every PR that changes an app must:

1. **Bump the app's version.** Bump `<app>/VERSION`, plus `APP_VERSION` and every local `?v=` cache-buster in that app. Apps without a `VERSION` file (hub, swb, upload, search) bump their service-worker cache `vN` instead.
2. **Bump the service-worker cache** to match (`CACHE_VERSION = '<prefix>-<VERSION>'`), with the cleanup still filtered to its own prefix.
3. **Pass the checks:** `npm test`, `npm run icons:check` and `node scripts/lint-release.cjs --base origin/main`. CI runs the same three.
4. **Get a checkpoint tag before merging:** `checkpoint-pre-<slug>-<YYYY-MM-DD>` on `origin/main`, so there's a known-good point to compare against or roll back to.

Test-only (`*.test.*`) and docs-only (`*.md`) changes don't need a bump. Neither does `hub/apps.json`, because CI regenerates it.

## `npm run live:check`: is the live site right?

```bash
node scripts/live-check.cjs                       # the whole site
node scripts/live-check.cjs --only planner,quote  # just these apps
node scripts/live-check.cjs --expect-repo-versions  # after a deploy: live versions must equal the repo's
node scripts/live-check.cjs --json                # machine output
```

It only makes GET requests. It checks every app in `hub/apps.json`, the home page, the private app and any other `noindex` folder:

- the page returns **200**;
- it shows the repo's **title**;
- its **version** (local `?v=` cache-busters, `APP_VERSION`, or else the `sw.js` cache name) matches `<app>/VERSION`. A mismatch is a warning, or a failure with `--expect-repo-versions`;
- **noindex** is live exactly where the repo's `index.html` has it;
- **`sw.js`** returns 200;
- **`sitemap.xml` and `robots.txt`** don't list the private app.

Private app paths are never printed. They show as "private app #1" unless you pass `--show-private`.

**Browser step (optional).** If `playwright` is installed locally (`npm i --no-save playwright && npx playwright install chromium`; don't add it to `package.json`), each page is also opened at 390×844. Console errors and failed requests count as failures, and screenshots go to `.live-check/`, which git ignores. Without playwright it prints `browser step skipped`. `--no-browser` skips it on purpose.

It exits with code 1 if anything fails.

## `npm run ship -- --branch <name> --slug <slug>`: release a PR

```bash
npm run ship -- --branch claude/some-fix --slug some-fix            # dry run: prints the plan
node scripts/ship.cjs --branch claude/some-fix --slug some-fix --execute  # really ship
```

1. **Always** (read-only): it checks you're on `--branch` with a clean tree, that every changed app bumped its version, and that the tests, icons check and release lint pass. If any of these fail, it **refuses** and stops.
2. **Dry run** (the default): it prints every remaining command and runs nothing that writes. That means no tag, no push and no `gh` call.
3. **`--execute`:**
   - creates and pushes the checkpoint tag on `origin/main`;
   - pushes the branch, then opens a PR with `gh pr create --fill`, or reuses the open one;
   - waits for CI (`gh pr checks --watch`), then squash-merges;
   - polls `https://www.neilldata.com` until every changed app serves its new `VERSION` (10 minutes by default; `--timeout-min` changes it);
   - runs the live check for those apps with `--expect-repo-versions`.
4. It always finishes by printing the **rollback** commands: revert the squash commit through a new PR, diff against the checkpoint tag, or drop the tag.

It uses the `gh` CLI that's already signed in on your machine. **The script never reads, stores or prints a token.** If CI fails, nothing is merged. If the live site doesn't update in time, the PR is already merged, so check the Pages deploy.

Other options: `--base origin/main` (the default) and `--site https://www.neilldata.com` (the default).

## Plain URL checks (JSON lines)

`npm run live:lines` prints one JSON line per check (status, text, noindex, console at 390px), then `{"summary":true,"passed":N,"failed":N,"skipped":N}`. Exit 0 only if nothing failed. Pass `--checks list.json` for your own list. The console check needs playwright from the machine's own tooling (`LIVE_CHECK_PLAYWRIGHT_MODULE=/path/to/playwright-core` and `LIVE_CHECK_CHROMIUM=/path/to/chrome`). It is skipped, not passed, when no browser is available.
