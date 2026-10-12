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
    default_output_path,
    estimate_brute_search,
    format_duration,
    format_eta,
    run_attack,
    state_path_for,
    unlock_pdf,
)
from qpdf_util import QpdfNotFoundError, require_qpdf  # noqa: E402


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Recover open passwords for PDFs you own (default: ordered brute force).",
    )
    p.add_argument("pdf", type=Path, help="Path to password-protected PDF")
    p.add_argument("--no-brute", action="store_true", help="Disable default brute-force search")
    p.add_argument("--no-lower", action="store_true", help="Exclude a-z from brute charset")
    p.add_argument("--no-upper", action="store_true", help="Exclude A-Z from brute charset")
    p.add_argument("--no-digit-chars", action="store_true", help="Exclude 0-9 from brute charset")
    p.add_argument("--symbols", action="store_true", help="Include symbol charset in brute force")
    p.add_argument("--charset", type=str, help="Custom brute charset (overrides checkboxes)")
    p.add_argument("--min-length", type=int, default=1, help="Brute min length (default 1)")
    p.add_argument("--max-length", type=int, default=8, help="Brute max length (default 8)")
    p.add_argument(
        "--hint",
        action="append",
        default=[],
        metavar="WORD",
        help="Optional: hint word(s) with mutations (secondary to brute)",
    )
    p.add_argument("--wordlist", type=Path, help="Optional: wordlist file (one password per line)")
    p.add_argument(
        "--digits",
        type=int,
        nargs="?",
        const=6,
        help="Optional: numeric-only brute 1..N digits",
    )
    p.add_argument("--common", action="store_true", help="Optional: try empty/common passwords first")
    p.add_argument("-j", "--jobs", type=int, default=0, help="Worker processes (default: CPU count)")
    p.add_argument("--batch-size", type=int, default=64, help="Passwords per worker batch")
    p.add_argument("--no-resume", action="store_true", help="Ignore saved state and start fresh")
    p.add_argument("--clear-state", action="store_true", help="Delete state file before run")
    p.add_argument("-o", "--output", type=Path, help="Unlocked PDF (default: <stem>-unlocked.pdf)")
    p.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="Skip confirmation for very large brute-force searches",
    )
    return p.parse_args(argv)


def args_to_options(args: argparse.Namespace) -> AttackOptions:
    return AttackOptions(
        brute_force=not args.no_brute,
        use_lower=not args.no_lower,
        use_upper=not args.no_upper,
        use_digits=not args.no_digit_chars,
        use_symbols=args.symbols,
        custom_charset=args.charset,
        min_length=args.min_length,
        max_length=args.max_length,
        run_common=args.common,
        hints=list(args.hint),
        wordlist=args.wordlist,
        digits_only=args.digits,
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
    try:
        phases = build_phases(options)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 1
    if not phases:
        print("No attack phases selected.", file=sys.stderr)
        return 1

    if options.brute_force and not args.yes:
        est = estimate_brute_search(options, pdf_path, qpdf_exe, benchmark=True)
        print(
            f"Brute force: {est.total_candidates:,} candidates, "
            f"charset {est.charset_size}, lengths {est.min_length}-{est.max_length}",
            file=sys.stderr,
        )
        print(
            f"~{est.passwords_per_sec:,.0f} pwd/s on this file → "
            f"ETA {format_duration(est.eta_seconds)} if password is in range",
            file=sys.stderr,
        )
        if est.max_length >= 8 and est.charset_size >= 62:
            print(
                "Warning: 8+ char mixed case+digits often takes years on one PC; "
                "password-manager random strings may be impractical.",
                file=sys.stderr,
            )
        if est.eta_seconds > 86400 * 7 and not args.yes:
            print("Refusing huge search without -y / --yes.", file=sys.stderr)
            return 1

    workers = args.jobs or os.cpu_count() or 4
    state_file = state_path_for(pdf_path)

    print(f"PDF: {pdf_path}")
    print(f"qpdf: {qpdf_exe}")
    print(f"Workers: {workers}  Batch size: {args.batch_size}")
    print("Own files only. Stop anytime; resume uses the .unlock-state.json file.")

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
