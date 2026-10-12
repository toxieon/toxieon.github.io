"""Worker entry points for ProcessPoolExecutor (must be importable, not __main__)."""
from __future__ import annotations

from typing import Optional


def try_batch(args: tuple[str, list[str]]) -> Optional[str]:
    pdf_path, passwords = args
    import pikepdf

    for pwd in passwords:
        try:
            with pikepdf.open(pdf_path, password=pwd):
                return pwd
        except pikepdf.PasswordError:
            continue
        except Exception:
            continue
    return None
