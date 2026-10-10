# Fit-off versions

Baseline: 0.1.1 (2026-10-01). Same rules as Planner (planner/VERSIONING.md): fixes increment the last number. Features increment the middle number and reset the last number to 1 (0.1.4 -> 0.2.1).

Every merge that touches this app updates VERSION, APP_VERSION in index.html, CHANGELOG.md, and fitoff/sw.js `CACHE_VERSION` (e.g. `fitoff-0.1.5`). The version stays visible in the app: sign-in screen and under the job list (`Fit-off v0.1.5`).

Changelog format: `## X.Y.Z · YYYY-MM-DD · slug · summary`, newest first. One handoff item per local patch. No release is deployed by making these files.
