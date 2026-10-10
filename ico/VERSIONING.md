# ICO Generator versions

Baseline: 0.1.1 (2026-10-06). Same rules as Planner (planner/VERSIONING.md): fixes increment the last number. Features increment the middle number and reset the last number to 1 (0.1.4 -> 0.2.1).

Every merge that touches this app updates VERSION (read by `generate.py`, reported by `GET /health` and `cli.py --version-info`), APP_VERSION and the `ico-canvas.js?v=X.Y.Z` query in index.html, CHANGELOG.md, and ico/sw.js `CACHE_VERSION` (e.g. `ico-0.1.7`), then `node hub/build-apps.cjs` regenerates hub/apps.json (the `ico` tile `version` comes from ico/VERSION; the GitHub Action also does this on push to main, and hub/build-apps.test.cjs fails if it's stale). The version stays visible on the page footer (`v0.1.7`).

Changelog format: `## X.Y.Z · YYYY-MM-DD · slug · summary`, newest first. One handoff item per local patch. No release is deployed by making these files.
