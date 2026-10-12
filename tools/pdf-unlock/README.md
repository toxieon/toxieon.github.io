# pdf-unlock

Local command-line tool to recover **open (user) passwords** on PDFs you own when you forgot the password. It does not crack third-party files, does not ship with a web UI, and is not linked from the public site hub.

**Honest expectations:** If the password is long, random, or unique, recovery may be impossible in practical time. This tool is for forgotten passwords on your own documents—short PINs, common passwords, or words you almost remember—not for breaking strong secrets.

## Requirements

- Python 3.10 or newer
- [pikepdf](https://github.com/pikepdf/pikepdf) (installed via `requirements.txt`)

## Install

### Windows

1. Open this folder in Explorer.
2. Double-click `setup.bat` (installs dependencies with `pip`).
3. Drag a locked PDF onto `unlock.bat`, or run from a terminal:

```bat
unlock.bat "C:\path\to\locked.pdf"
```

### macOS / Linux

```bash
cd tools/pdf-unlock
python3 -m pip install -r requirements.txt
python3 pdf_unlock.py /path/to/locked.pdf
```

## Usage

```text
python pdf_unlock.py <locked.pdf> [options]
```

### Default pipeline

With no extra flags, the tool tries an **empty password** and a small list of **common passwords**.

### Attack modes (combine as needed)

| Option | Description |
|--------|-------------|
| `--hint WORD` | Repeatable. Mutates each word: case, leet (`a`→`4`, etc.), years `1990`–`2026`, suffix digits `0`–`999`, and `!@#`. |
| `--wordlist FILE` | One candidate password per line. |
| `--digits [N]` | All numeric strings from length 1 through `N` (default `N=6` if you pass `--digits` alone). Values above 6 print a warning. |
| `--brute` | Charset brute force: lowercase + digits, lengths 1–5 (override with `--min-length` / `--max-length`). |
| `--charset STRING` | Custom charset with `--min-length` / `--max-length` (implies charset brute). |
| `--no-common` | Skip the default empty/common phase. |

### Performance and resume

- Uses all CPU cores by default (`-j N` to limit workers).
- Shows passwords/sec, last tried password, and ETA when the search size is known.
- Writes `<file>.pdf.unlock-state.json` beside the PDF so you can stop and continue later. Use `--no-resume` to start over or `--clear-state` to delete saved progress.

### Output

On success, prints the password and writes `<original-stem>-unlocked.pdf` (or `-o path.pdf`).

## Examples

```bash
# Quick try (common list)
python pdf_unlock.py report.pdf

# You remember it was a name + year
python pdf_unlock.py report.pdf --hint Neill --hint Brandon

# PIN-style
python pdf_unlock.py report.pdf --digits 4

# Custom dictionary
python pdf_unlock.py report.pdf --wordlist my-passwords.txt

# Short charset brute (only practical for tiny spaces)
python pdf_unlock.py report.pdf --no-common --charset abc123 --min-length 4 --max-length 5
```

## Self-test

```bash
python3 -m pip install -r requirements.txt
python3 -m unittest tests/test_pdf_unlock.py -v
```

The test creates a disposable encrypted PDF with a known short password (nothing sensitive is committed).

## Distribution zip

```bash
chmod +x build-zip.sh
./build-zip.sh
```

Produces `pdf-unlock.zip` in this directory.

## Legal and ethics

Use **only** on PDFs you created or own and are allowed to access. You are responsible for compliance with local law and organizational policy. MIT licensed—see [LICENSE](LICENSE).
