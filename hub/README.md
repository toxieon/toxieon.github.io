# Suite hub (/hub/)

The hub shows one tile per app. The list (`hub/apps.json`) is **generated**: don't edit it by hand.

## Adding a new tool

Create a top-level folder with an `index.html` (e.g. `/mytool/index.html`) and push to main. That's it: the
"Hub apps" GitHub Action runs `node hub/build-apps.cjs`, commits the new `hub/apps.json`, and the tile appears.

Defaults: name = `<title>` (an `ND • ` prefix is dropped), icon = the page's `<link rel="icon">`, else
`mytool/favicon.svg`, else the suite icon `assets/suite-icons/apps/mytool.svg`; colour = the suite icon colour, else
slate `#94a3b8`; order 99 (after the existing apps, then alphabetical); version = `mytool/VERSION` if present.

To customise, add meta tags to the page's `<head>`:

```html
<meta name="nd:app" content="My Tool" />           <!-- tile name -->
<meta name="nd:icon" content="/mytool/favicon.svg" /> <!-- relative paths resolve from the folder -->
<meta name="nd:color" content="#60a5fa" />         <!-- #RRGGBB -->
<meta name="nd:order" content="12" />              <!-- lower = earlier -->
<meta name="nd:hidden" content="true" />           <!-- keep it off the hub -->
<meta name="nd:description" content="What it does" />
<meta name="nd:id" content="my-tool" />            <!-- defaults to the folder name -->
```

Or put the same keys in `mytool/app.json` (`{"name": "...", "color": "...", "order": 12, "hidden": false}`); app.json wins
over meta tags. See `ico/index.html` for an example.

Priority, low to high: defaults < `hub/discover.json` "overrides" (keeps the tiles that existed before discovery
unchanged without editing their pages) < `nd:*` meta tags < `app.json`.

Folders that aren't apps: folders without an `index.html` (assets/, shared/, apps-script/, areas/) are skipped
automatically; others are listed in `hub/discover.json` "exclude" (hub itself, checklist, games, timesheetlive).
Remove a folder from that list to give it a tile.

## Local

```sh
npm run hub:apps    # or: node hub/build-apps.cjs      (regenerate)
npm run hub:check   # or: node hub/build-apps.cjs --check (exit 1 if stale)
npm run test:hub    # generator + suite-icons tests
```

Invalid values (bad colour, id with spaces, duplicate ids) make the generator fail with the folder name, so the
Action run goes red instead of publishing a broken list.

## Caching

`sw.js` serves `apps.json` and the hub HTML network-first (cached copy only when offline), and `app.js` re-reads
the list when the installed app is resumed, so new tiles show without bumping the service worker.
