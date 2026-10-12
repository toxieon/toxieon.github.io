#!/usr/bin/env python3
"""Self-test: create a short-password PDF fixture and recover it."""
from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "pdf_unlock.py"


def make_locked_pdf(path: Path, password: str) -> None:
    import pikepdf

    pdf = pikepdf.Pdf.new()
    pdf.add_blank_page(page_size=(612, 792))
    pdf.save(
        path,
        encryption=pikepdf.Encryption(user=password, owner=password, R=4),
    )


class PdfUnlockSelfTest(unittest.TestCase):
    def test_recovers_known_password_via_wordlist(self) -> None:
        known = "fixture7"
        with tempfile.TemporaryDirectory() as tmp:
            td = Path(tmp)
            locked = td / "sample.pdf"
            make_locked_pdf(locked, known)
            wordlist = td / "words.txt"
            wordlist.write_text("wrong\nnotit\n{}\n".format(known), encoding="utf-8")
            out = td / "sample-unlocked.pdf"

            proc = subprocess.run(
                [
                    sys.executable,
                    str(CLI),
                    str(locked),
                    "--no-common",
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

            import pikepdf

            with pikepdf.open(out) as pdf:
                self.assertGreater(len(pdf.pages), 0)


if __name__ == "__main__":
    unittest.main()
