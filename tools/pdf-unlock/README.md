# pdf-unlock

Local tool to recover **open (user) passwords** on PDFs you own. Not linked from the public site hub.

Password checks use **[qpdf](https://github.com/qpdf/qpdf)** (`qpdf --password=… --decrypt …`). Python orchestrates multiprocessing, resume state, CLI, and a **tkinter** GUI.

**Default attack:** ordered **brute force** by increasing length — `a`, `b`, … `z`, `A`, … `Z`, `0`–`9`, optional symbols, then `aa`, `ab`, … (for password-manager style random strings). Dictionary, hints, and common passwords are **optional** secondary modes.

**Honest expectations:** 8+ character mixed case + digits (and symbols) is often **years** on one PC. Truly random passwords may never finish. Use only on files you own.

## Requirements

- **Python 3.10+** (tkinter on most installers)
- **qpdf** on `PATH`

| Platform | Install |
|----------|---------|
| Windows | `winget install qpdf.qpdf` |
| Linux | `sudo apt install qpdf` |
| macOS | `brew install qpdf` |

Optional: `QPDF_PATH` → full path to `qpdf`. No pip packages required.

## Windows

1. Install Python + qpdf.
2. `setup.bat` — verifies both (no heavy downloads).
3. **GUI:** `unlock-gui.bat` (brute force on by default; confirm dialog shows ETA).
4. **CLI:** `unlock.bat "file.pdf"` (large searches need `-y`).

## CLI

```text
python pdf_unlock.py <locked.pdf> [options]
```

**Defaults:** brute `a–z` + `A–Z` + `0–9`, lengths **1–8**. Prints benchmarked ETA; refuses week-scale+ searches unless `-y`.

| Option | Description |
|--------|-------------|
| `--no-brute` | Disable brute force |
| `--no-lower` / `--no-upper` / `--no-digit-chars` | Trim charset |
| `--symbols` | Add `!@#$…` to charset |
| `--min-length` / `--max-length` | Length range (defaults 1 / 8) |
| `--charset STRING` | Custom ordered charset |
| `--common` | Optional: empty/common list first |
| `--hint WORD` | Optional: mutated hints |
| `--wordlist FILE` | Optional: dictionary |
| `--digits [N]` | Optional: numeric-only 1..N |
| `-y` | Confirm huge brute-force search |

Resume: `<file>.pdf.unlock-state.json`. Stop anytime; run again to continue.

## GUI

`pdf_unlock_gui.py` / `unlock-gui.bat`:

- **Brute force** on by default with **a–z / A–Z / 0–9 / symbols** checkboxes and min→max length
- Live **last password tried** (large monospace), passwords/sec, ETA
- **Start** runs a quick benchmark and asks you to confirm if the search is large
- Optional collapsible dictionary/hints/common (off by default)
- **Stop** saves resume state

## Self-test

```bash
python3 -m unittest tests/test_pdf_unlock.py -v
```

(requires `qpdf`; creates encrypted fixture in temp)

## Legal

Own files only. MIT — see [LICENSE](LICENSE).
