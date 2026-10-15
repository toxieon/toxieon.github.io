"""Thin wrappers around the qpdf CLI for password checks and decrypt."""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional

QPDF_ENV = "QPDF_PATH"


class QpdfNotFoundError(RuntimeError):
    pass


def find_qpdf() -> Optional[str]:
    override = os.environ.get(QPDF_ENV)
    if override and Path(override).is_file():
        return override
    return shutil.which("qpdf")


def require_qpdf() -> str:
    exe = find_qpdf()
    if not exe:
        raise QpdfNotFoundError(
            "qpdf not found on PATH. Install it (e.g. winget install qpdf, "
            "sudo apt install qpdf) or set QPDF_PATH to the qpdf executable."
        )
    return exe


def test_password(pdf_path: str | Path, password: str, qpdf_exe: Optional[str] = None) -> bool:
    """Return True if password opens the PDF (exit code 0)."""
    qpdf = qpdf_exe or require_qpdf()
    cmd = [
        qpdf,
        f"--password={password}",
        "--decrypt",
        str(pdf_path),
        "-",
    ]
    result = subprocess.run(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def decrypt_pdf(
    pdf_path: str | Path,
    password: str,
    out_path: str | Path,
    qpdf_exe: Optional[str] = None,
) -> None:
    qpdf = qpdf_exe or require_qpdf()
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        qpdf,
        f"--password={password}",
        "--decrypt",
        str(pdf_path),
        str(out_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        msg = (result.stderr or result.stdout or "qpdf decrypt failed").strip()
        raise RuntimeError(msg)
