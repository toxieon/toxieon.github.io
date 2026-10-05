# ICO Generator (Neill Data Suite)

Makes multi-size Windows `.ico` files with two lines of text so Desktop folders show name + version at a glance:

- **Line 1:** program name, bold white (e.g. `TipBot`)
- **Line 2:** version, regular weight, slightly dimmer (e.g. `0.45.1`)
- **Background:** solid Neill navy `#0B1F3A` (override with `bg` / `fg`), or **transparent** (`bg=transparent`): real alpha, text keeps `fg` (white by default) with a subtle contrasting outline so it reads on light and dark wallpapers
- **Sizes:** 16, 32, 48, 256 px, each drawn natively (not scaled down) so small sizes stay crisp

| Size | What's drawn |
|---|---|
| 16 px | Initials only (auto: `TipBot` -> `TB`, `Neill Data` -> `ND`; override with `short`) |
| 32 / 48 px | Name + version. If the full name can't fit at a legible size (>= 8-9 px font) line 1 uses initials (`NDS` for `Neill Data Suite`) |
| 256 px | Full name + version, shrunk to fit |

The **Python API + CLI is the canonical path** for scripts (Ray / Husker refreshing TipBot Today / Neill Data Suite copies). The static page at <https://www.neilldata.com/ico/> draws the same icon in the browser for one-offs (no server needed on GitHub Pages).

## Run locally

From the repo root (Python 3.10+):

```bash
pip install -r ico/requirements.txt          # CLI alone only needs pillow

# CLI
python -m ico.cli TipBot 0.45.1 -o TipBot.ico
python ico/cli.py "Neill Data" 0.19.1          # -> Neill-Data-0.19.1.ico
python ico/cli.py TipBot 0.45.1 --bg "#123456" --fg "#ffcc00" --short TB --png preview.png
python ico/cli.py TipBot 0.45.1 --bg transparent  # alpha background (also: --bg none)

# HTTP API (port 8765)
uvicorn ico.server:app --host 127.0.0.1 --port 8765
# or: python ico/server.py   (ICO_HOST / ICO_PORT env vars)
```

## Call the API

```bash
curl http://127.0.0.1:8765/health
# {"status":"ok","version":"0.1.2"}

curl -fOJ "http://127.0.0.1:8765/ico?name=TipBot&version=0.45.1"
# saves TipBot-0.45.1.ico (Content-Type: image/x-icon, Content-Disposition: attachment)

curl -fo ND.ico "http://127.0.0.1:8765/ico?name=Neill%20Data&version=0.19.1&bg=%230B1F3A&fg=%23FFFFFF"

curl -fOJ "http://127.0.0.1:8765/ico?name=TipBot&version=0.45.1&bg=transparent"
```

PowerShell:

```powershell
Invoke-WebRequest "http://127.0.0.1:8765/ico?name=TipBot&version=0.45.1" -OutFile TipBot-0.45.1.ico
```

| Query | Required | Default | Notes |
|---|---|---|---|
| `name` | yes | | max 40 chars |
| `version` | yes | | max 24 chars |
| `bg` | no | `#0B1F3A` | hex `#RRGGBB` or `#RGB` (encode `#` as `%23`), or `transparent` / `none` / empty (`bg=`), any case. Leaving `bg` out entirely gives navy |
| `fg` | no | `#FFFFFF` | hex |
| `short` | no | initials | text for the 16 px frame, max 4 chars |
| `sizes` | no | `16,32,48,256` | comma list from 16, 20, 24, 32, 40, 48, 64, 96, 128, 256 |

Bad input returns `400` (or `422` if `name`/`version` is missing). Interactive docs: `http://127.0.0.1:8765/docs`.

From Python without HTTP: `from ico.generate import generate_ico; data = generate_ico("TipBot", "0.45.1")` (add `bg="transparent"` for alpha; `bg=None` means navy).

## Transparent icons: what to expect

- Every frame is a 32-bit RGBA PNG inside the `.ico`, so Windows Vista and later (Explorer, Desktop) show the real alpha. The outline is about 2 % of the icon size (1 px at 16-48 px, 5 px at 256), dark for light text and light for dark `fg`.
- Explorer draws the selection / hover highlight behind the icon, and with a transparent icon only the text is visible, so the folder no longer looks like a folder (no yellow folder shape). That's expected; use the navy default if you want a solid tile.
- At 16 px the outlined initials are bolder than on navy because a 1 px outline is large at that size.
- Very old tools that only read BMP-type ICO frames (pre-Vista) won't read PNG frames. Not a concern on Windows 10/11.
- Explorer caches folder icons. When switching an existing folder from navy to transparent, give the new `.ico` a different filename (or restart Explorer) or the old one may stay.

## Apply the icon to a Windows folder (out of scope here)

The Suite only makes the `.ico`. On the Windows PC, apply it with either tool (both MIT, not vendored here):

- [demberto/FolderIkon](https://github.com/demberto/FolderIkon) (Python, `pip install folderikon`):
  `folderikon -i "TipBot Today\TipBot-0.45.1.ico" -d "TipBot Today"`
- [goddivor/seticon-cli](https://github.com/goddivor/seticon-cli) (Node, `npm i -g seticon-cli`):
  `seticon set -f "TipBot Today" -i "TipBot-0.45.1.ico"`

Both use an existing `.ico` as-is (our hand-drawn 16/32/48 px frames are kept, not re-converted), write `desktop.ini` and set the folder attributes. Don't use seticon's `--overlay` mode; the Suite style is plain text-on-navy. Keep the `.ico` inside the folder so the icon travels with the copy. Explorer caches icons: put the version in the `.ico` filename (the default) so each refresh is a new path, or restart Explorer if an old icon sticks.

## Files

| File | Purpose |
|---|---|
| `generate.py` | Pillow draw + ICO encode (shared by server and CLI) |
| `server.py` | FastAPI app: `GET /ico`, `GET /health` |
| `cli.py` | Command line front end |
| `ico-canvas.js` | Browser twin of `generate.py` (Canvas draw + small ICO packer), used by `index.html` |
| `index.html` | Static page served at `/ico/` |
| `fonts/` | DejaVu Sans + Bold, so server, CLI and page render the same on any OS |
| `test_ico.py`, `ico-canvas.test.cjs` | `python -m unittest ico.test_ico` (pip install httpx for the HTTP tests) and `node --test ico/ico-canvas.test.cjs` |

## Licences (permissive only, checked 2026-10-06)

| Component | Version | Licence | Where |
|---|---|---|---|
| Pillow | 12.3.0 | MIT-CMU (HPND family, permissive). Wheels bundle libjpeg, libpng, zlib, FreeType (used under FTL), HarfBuzz, etc. | `LICENSE.Pillow.txt` (full wheel licence) |
| FastAPI | 0.142.2 | MIT | pip |
| Starlette (via FastAPI) | 1.7.0 | BSD-3-Clause | pip |
| pydantic / pydantic-core | 2.13.5 / 2.46.5 | MIT | pip |
| uvicorn | 0.54.0 | BSD-3-Clause | pip |
| Other transitive: anyio, h11, annotated-types, annotated-doc, typing-inspection (MIT); click, idna (BSD-3); opentelemetry-api (Apache-2.0); typing-extensions (PSF-2.0) | | permissive | pip |
| DejaVu Sans fonts | 2.37 | Bitstream Vera licence + public domain changes | `fonts/LICENSE.txt` |
| `ico-canvas.js` ICO packer | | Neill Data code, no third-party JS | |

No GPL / LGPL / AGPL packages in the runtime dependency tree (`pip-licenses` on a clean venv). No PNG->ICO helper was needed: Pillow writes multi-size ICO natively (PNG-compressed frames, Windows Vista and later).
