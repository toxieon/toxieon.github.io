# pdf-unlock

Local tool to recover **open (user) passwords** on PDFs you own when you forgot the password. It is not linked from the public site hub.

Password checks use the **[qpdf](https://github.com/qpdf/qpdf)** command-line tool (`qpdf --password=… --decrypt …`). Python handles orchestration, word generation, multiprocessing, resume state, CLI, and a small **tkinter** GUI.

**Honest expectations:** Long, random, or unique passwords may be impossible to recover in practical time. Use this only for your own files—short PINs, common passwords, or words you almost remember.

## Requirements

- **Python 3.10+** (tkinter included with most official installers)
- **qpdf** on your `PATH`

### Install qpdf

| Platform | Command |
|----------|---------|
| **Windows** | `winget install qpdf.qpdf` (or a [release build](https://github.com/qpdf/qpdf/releases)) |
| **Linux (Debian/Ubuntu)** | `sudo apt install qpdf` |
| **macOS** | `brew install qpdf` |

Optional: set `QPDF_PATH` to the full path of the `qpdf` executable if it is not on `PATH`.

No pip packages are required (`requirements.txt` is documentation only).

## Windows quick start

1. Install Python and qpdf (see above).
2. Run `setup.bat` — verifies both are available (does not download heavy dependencies).
3. **GUI:** double-click `unlock-gui.bat`
4. **CLI:** drag a PDF onto `unlock.bat`, or:

```bat
unlock.bat "C:\path\to\locked.pdf" --hint YourWord
```

## macOS / Linux

```bash
cd tools/pdf-unlock
python3 pdf_unlock.py /path/to/locked.pdf
python3 pdf_unlock_gui.py   # desktop GUI
```

## CLI usage

```text
python pdf_unlock.py <locked.pdf> [options]
```

### Default pipeline

With no extra flags, tries an **empty password** and a small **common password** list.

### Attack modes

| Option | Description |
|--------|-------------|
| `--hint WORD` | Repeatable. Mutates: case, leet, years `1990`–`2026`, digits `0`–`999`, `!@#`. |
| `--wordlist FILE` | One candidate per line. |
| `--digits [N]` | Numeric strings length 1..`N` (default `N=6` if flag has no value). Warns if `N>6`. |
| `--brute` | Charset brute: lowercase+digits, lengths 1–5 (override with `--min-length` / `--max-length`). |
| `--charset STRING` | Custom charset + length bounds (implies charset brute). |
| `--no-common` | Skip empty/common phase. |

### Performance and resume

- Uses all CPU cores (`-j N` to limit).
- Live stats: passwords/sec, ETA (when search size is known), last candidate.
- Resume file: `<file>.pdf.unlock-state.json` beside the PDF. `--no-resume` or `--clear-state` to reset.

### Output

On success, prints the password and writes `<stem>-unlocked.pdf` (or `-o path.pdf`) via `qpdf --decrypt`.

## GUI

`pdf_unlock_gui.py` (or `unlock-gui.bat` on Windows):

- Pick PDF, hints, wordlist, digits max, charset / min / max length
- **Start** / **Stop** (stop keeps resume state)
- Progress: tried/sec, ETA, last password
- Success dialog with password and path to the unlocked file

## Examples

```bash
python pdf_unlock.py report.pdf
python pdf_unlock.py report.pdf --hint Neill --digits 4
python pdf_unlock.py report.pdf --wordlist passwords.txt
```

## Self-test

Requires `qpdf` on PATH:

```bash
python3 -m unittest tests/test_pdf_unlock.py -v
```

Creates a disposable encrypted fixture in a temp directory (no secrets in the repo).

## Distribution zip

```bash
chmod +x build-zip.sh
./build-zip.sh
```

## Legal

Use **only** on PDFs you own or may access. MIT licensed — see [LICENSE](LICENSE).
