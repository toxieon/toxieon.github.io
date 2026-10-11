# Reel Reader versions

Baseline: 0.1.1 (2026-10-11).

Fixes increment the last number. Features increment the middle number and reset the last number to 1 (for example `0.1.4` -> `0.2.1`).

Every merge that touches this app updates:
- `reelreader/VERSION`
- `APP_VERSION` references (`styles.css?v=X.Y.Z`, `app.js?v=X.Y.Z`) in `reelreader/index.html`
- `reelreader/CHANGELOG.md`
- `CACHE_VERSION` in `reelreader/sw.js` (`reelreader-X.Y.Z`)

The version stays visible in the app footer (`Reel Reader vX.Y.Z`).

Changelog format: `## X.Y.Z · YYYY-MM-DD · slug · summary`, newest first.
