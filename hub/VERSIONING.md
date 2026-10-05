# Hub versions

Baseline: 0.5.0 (the `?v=0.5.0` asset queries and "Hub v0.5" header that existed before this file). Same rules as Planner (planner/VERSIONING.md): fixes increment the last number. Features increment the middle number and reset the last number to 1 (0.6.1 -> 0.7.1).

Every merge that touches the hub shell (index.html, app.js, styles.css, sw.js) updates hub/VERSION, CHANGELOG.md, the version in the app.js header comment, the `app.js?v=` / `styles.css?v=` queries in index.html and sw.js, and the `CACHE_VERSION` in sw.js (`hub-vN`, +1 each release).

Adding or changing a tile does NOT need a hub release: apps.json is generated (see hub/README.md) and the service worker always fetches it network-first.

Changelog format: `## X.Y.Z · YYYY-MM-DD · slug · summary`.
