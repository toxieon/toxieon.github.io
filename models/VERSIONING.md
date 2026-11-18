# TipBot Models versions

Baseline: 0.1.0. Same rules as Planner (planner/VERSIONING.md): fixes increment the last number; features increment the middle number and reset the last to 1.

Every merge touching the app updates VERSION, APP_VERSION in app.js, `?v=` queries in index.html, CHANGELOG.md, and the sw.js cache name (`models-X.Y.Z`).

Changelog format: `## X.Y.Z · YYYY-MM-DD · slug · summary`.