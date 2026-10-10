# TipDash visual assets (vendored)

Static art copied from the public [tipbot-dashboard](https://github.com/toxieon/tipbot-dashboard) repo under `assets/`, excluding paths containing `master`, `mirror`, `forward`, `consensus`, `ops`, or `owner`, and excluding `labs/` demos.

- **Bookmaker logos** — `bookies/*.svg`
- **Match FX** — `fx/*.svg`
- **Brand / PWA** — `logo.svg`, `favicon.svg`, `favicon.ico`, `icon-*.png`, `apple-touch-icon.png`
- **Fonts** — `fonts/*.woff2` (+ OFL text in upstream repo)
- **AFL guernseys** — `guernseys/*.svg` generated at catalog build time from `source/afl-guernseys.js` (same module as TipDash; not re-rendered PNGs)

Refresh: clone tipbot-dashboard, copy new image files into this tree, update `source/afl-guernseys.js` if needed, then `npm run visual:catalog`.
