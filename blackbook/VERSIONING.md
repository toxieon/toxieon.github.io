# Black Book versions

Baseline: 0.1.0. Same rules as Planner (planner/VERSIONING.md): fixes increment the last number; features increment the middle number and reset the last to 1.

Every merge touching the app updates VERSION, APP_VERSION in app.js, `data-version` and the `?v=` queries in index.html, and CHANGELOG.md. There is no service worker, so there is no cache name to bump.

Changelog format: `## X.Y.Z · YYYY-MM-DD · slug · summary`.
