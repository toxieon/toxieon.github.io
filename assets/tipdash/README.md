# TipDash visual assets (vendored)

Public TipDash art for the Assets visual library. Only the folders and files below are included (allow-list in scripts/build-visual-catalog.cjs).

- **Bookmaker marks**: `bookies/*.svg` (simple text-on-colour marks drawn for TipDash; names are their owners' trademarks)
- **Match FX**: `fx/*.svg`
- **Brand / PWA**: `logo.svg`, `favicon.svg`, `favicon.ico`, `icon-*.png`, `apple-touch-icon.png`
- **AFL guernseys**: `guernseys/*.svg`, generated at catalogue build time from `source/afl-guernseys.js` (club colours and generic patterns only, no logos)

No fonts are vendored (the TipDash web fonts are SIL OFL, outside the suite's permissive-licence policy). See NOTICES.txt.

Refresh: copy updated files for the folders above into this tree, update `source/afl-guernseys.js` if needed, then `npm run visual:catalog`.
