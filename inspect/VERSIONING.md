# Inspect versions

Baseline: 0.1.1 (2026-11-13). Same rules as Planner (planner/VERSIONING.md): fixes increment the last number. Features increment the middle number and reset the last number to 1 (0.1.4 -> 0.2.1).

Every merge that touches this app updates VERSION, APP_VERSION in app.js, the footer in index.html, CHANGELOG.md, and the sw.js cache name (`inspect-X.Y.Z`).

Changelog format: `## X.Y.Z · YYYY-MM-DD · slug · summary`, newest first.
