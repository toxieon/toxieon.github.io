# Assets versions

Baseline: 1.0.0, which is `assets/VERSION` at the Asset Studio 1.0.0 release (2026-10-01). Same rules as Planner (planner/VERSIONING.md): fixes increment the last number. Features increment the middle number and reset the last number to 1 (1.0.0 -> 1.1.1).

Every merge that changes the Assets app updates `1234567890/VERSION`, `APP_VERSION` in `1234567890/index.html` and `1234567890/CHANGELOG.md`. The app here means the `/1234567890/` showroom, the `assets/ASSETS.txt` catalogue and new library entries. Then run `npm run hub:apps`: the hub tile's `version` comes from `1234567890/VERSION`, and `hub/build-apps.test.cjs` fails if `hub/apps.json` is stale. The showroom has no service worker, so there is no cache name to bump. The version stays visible in the showroom footer (`Assets v1.1.1`).

`assets/VERSION` and `assets/CHANGELOG.md` remain the Asset Studio page's own version (`/assets/studio/`, footer "ASSET STUDIO 1.0.0", `?v=` queries there). Bump them only when the Studio changes. Suite icons carry their own library version in `assets/suite-icons/catalog.json`.

Changelog format: `## X.Y.Z · YYYY-MM-DD · slug · summary`, newest first.
