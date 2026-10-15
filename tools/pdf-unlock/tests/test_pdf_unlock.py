#!/usr/bin/env python3
"""Self-test: create a short-password PDF fixture with qpdf and recover it."""
from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "pdf_unlock.py"


def qpdf_available() -> bool:
    try:
        subprocess.run(["qpdf", "--version"], capture_output=True, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def make_locked_pdf(path: Path, password: str) -> None:
    """Build a minimal PDF and encrypt with qpdf (nothing sensitive committed)."""
    plain = path.with_suffix(".plain.pdf")
    # Minimal valid-enough PDF for qpdf to ingest.
    plain.write_bytes(
        b"""%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
trailer<< /Size 4 /Root 1 0 R >>
startxref
178
%%EOF
"""
    )
    enc = subprocess.run(
        [
            "qpdf",
            "--encrypt",
            password,
            password,
            "256",
            "--",
            str(plain),
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    if enc.returncode not in (0, 3):
        raise RuntimeError(enc.stderr or enc.stdout or "qpdf encrypt failed")
    plain.unlink(missing_ok=True)


@unittest.skipUnless(qpdf_available(), "qpdf CLI not installed")
class PdfUnlockSelfTest(unittest.TestCase):
    def test_recovers_known_password_via_wordlist(self) -> None:
        known = "fixture7"
        with tempfile.TemporaryDirectory() as tmp:
            td = Path(tmp)
            locked = td / "sample.pdf"
            make_locked_pdf(locked, known)
            wordlist = td / "words.txt"
            wordlist.write_text(f"wrong\nnotit\n{known}\n", encoding="utf-8")
            out = td / "sample-unlocked.pdf"

            proc = subprocess.run(
                [
                    sys.executable,
                    str(CLI),
                    str(locked),
                    "--no-brute",
                    "--wordlist",
                    str(wordlist),
                    "--no-resume",
                    "-o",
                    str(out),
                ],
                capture_output=True,
                text=True,
                cwd=str(ROOT),
            )
            self.assertEqual(proc.returncode, 0, msg=proc.stderr + proc.stdout)
            self.assertIn(f"Password: {known}", proc.stdout)
            self.assertTrue(out.is_file(), "unlocked PDF should exist")

            show = subprocess.run(
                ["qpdf", "--show-npages", str(out)],
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertIn("1", show.stdout)


if __name__ == "__main__":
    unittest.main()
