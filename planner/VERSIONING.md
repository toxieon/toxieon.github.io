# Planner versions

Baseline: 0.9.4. Fixes increment the last number. Features increment the middle number and reset the last number to 1 (0.9.4 -> 0.10.1).

Every merge updates VERSION, APP_VERSION in app.js, CHANGELOG.md, the sw.js cache name and the app/style query versions in index.html and sw.js. The version remains visible in Settings > About.

Changelog format: `## X.Y.Z · YYYY-MM-DD · slug · summary`. One handoff item per local patch. No release is deployed by making these files.
