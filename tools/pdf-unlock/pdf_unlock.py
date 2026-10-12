#!/usr/bin/env python3
"""CLI entry point for pdf-unlock (orchestration only; qpdf tests passwords)."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Optional, Sequence

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from core import (  # noqa: E402
    AttackOptions,
    ProgressUpdate,
    build_phases,
    count_charset,
    default_output_path,
    format_eta,
    run_attack,
    state_path_for,
    unlock_pdf,
)
from qpdf_util import QpdfNotFoundError, require_qpdf  # noqa: E402


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Recover open passwords for PDFs you own (local CLI).",
    )
    p.add_argument("pdf", type=Path, help="Path to password-protected PDF")
    p.add_argument(
        "--hint",
        action="append",
        default=[],
        metavar="WORD",
        help="Hint word(s); expands with case, leet, years 1990-2026, digits 0-999, !@#",
    )
    p.add_argument("--wordlist", type=Path, help="Text file, one password per line")
    p.add_argument(
        "--digits",
        type=int,
        nargs="?",
        const=6,
        help="Brute numeric passwords 1..N digits (default N=6 if flag has no value)",
    )
    p.add_argument(
        "--charset",
        type=str,
        help="Character set for length brute (with --min-length / --max-length)",
    )
    p.add_argument(
        "--brute",
        action="store_true",
        help="Charset brute: lowercase+digits, lengths 1-5 unless overridden",
    )
    p.add_argument("--min-length", type=int, default=1, help="Min brute length (default 1)")
    p.add_argument("--max-length", type=int, default=5, help="Max brute length (default 5)")
    p.add_argument("--no-common", action="store_true", help="Skip empty/common password phase")
    p.add_argument("-j", "--jobs", type=int, default=0, help="Worker processes (default: CPU count)")
    p.add_argument("--batch-size", type=int, default=64, help="Passwords per worker batch")
    p.add_argument("--no-resume", action="store_true", help="Ignore saved state and start fresh")
    p.add_argument("--clear-state", action="store_true", help="Delete state file before run")
    p.add_argument("-o", "--output", type=Path, help="Unlocked PDF (default: <stem>-unlocked.pdf)")
    return p.parse_args(argv)


def args_to_options(args: argparse.Namespace) -> AttackOptions:
    return AttackOptions(
        run_common=not args.no_common,
        hints=list(args.hint),
        wordlist=args.wordlist,
        digits=args.digits,
        charset=args.charset,
        brute=args.brute,
        min_length=args.min_length,
        max_length=args.max_length,
    )


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    pdf_path = args.pdf.resolve()
    if not pdf_path.is_file():
        print(f"File not found: {pdf_path}", file=sys.stderr)
        return 1

    try:
        qpdf_exe = require_qpdf()
    except QpdfNotFoundError as exc:
        print(exc, file=sys.stderr)
        return 1

    options = args_to_options(args)
    if options.brute or options.charset:
        total = count_charset(
            options.charset or "abcdefghijklmnopqrstuvwxyz0123456789",
            options.min_length,
            options.max_length,
        )
        print(f"Charset search size: {total:,} candidates", file=sys.stderr)

    if options.digits is not None and options.digits > 6:
        total = sum(10**i for i in range(1, options.digits + 1))
        print(
            f"Warning: --digits {options.digits} tries up to {total:,} candidates; "
            "this may take a long time.",
            file=sys.stderr,
        )

    phases = build_phases(options)
    if not phases:
        print(
            "No attack phases selected. Omit --no-common or add --hint / --wordlist / "
            "--digits / --brute.",
            file=sys.stderr,
        )
        return 1

    workers = args.jobs or os.cpu_count() or 4
    state_file = state_path_for(pdf_path)

    print(f"PDF: {pdf_path}")
    print(f"qpdf: {qpdf_exe}")
    print(f"Workers: {workers}  Batch size: {args.batch_size}")
    print("For your own files only. Long or random passwords may be impractical to recover.")

    def on_progress(update: ProgressUpdate) -> None:
        line = (
            f"tried={update.tried:,}  last={update.last_password!r}  "
            f"{update.rate:.1f} pwd/s  {format_eta(update.eta_seconds)}"
        )
        print(line, end="\r", flush=True)

    password = run_attack(
        pdf_path,
        phases,
        qpdf_exe=qpdf_exe,
        workers=workers,
        batch_size=args.batch_size,
        state_file=state_file,
        resume=not args.no_resume,
        clear_state=args.clear_state,
        on_progress=on_progress,
    )

    if password is None:
        print("\nPassword not found with the selected attack phases.", file=sys.stderr)
        return 2

    out = args.output or default_output_path(pdf_path)
    unlock_pdf(pdf_path, password, out.resolve(), qpdf_exe)
    print(f"\nSuccess! Password: {password}")
    print(f"Wrote: {out.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
