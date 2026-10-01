# Quote versions

Baseline: 0.1.1 (2026-10-01). Same rules as Planner (planner/VERSIONING.md): fixes increment the last number. Features increment the middle number and reset the last number to 1 (0.1.4 -> 0.2.1).

Every merge that touches this app updates VERSION, APP_VERSION in index.html, CHANGELOG.md, and the sw.js cache name (`quote-X.Y.Z`). The version stays visible in the app: Settings page footer (`v0.1.1` after "internal quoting tool").

Changelog format: `## X.Y.Z · YYYY-MM-DD · slug · summary`, newest first. One handoff item per local patch. No release is deployed by making these files.
