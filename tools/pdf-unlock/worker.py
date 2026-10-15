"""Worker entry points for ProcessPoolExecutor (must be importable, not __main__)."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from qpdf_util import test_password  # noqa: E402


def try_batch(args: tuple[str, str, list[str]]) -> Optional[str]:
    qpdf_exe, pdf_path, passwords = args
    for pwd in passwords:
        if test_password(pdf_path, pwd, qpdf_exe=qpdf_exe):
            return pwd
    return None
