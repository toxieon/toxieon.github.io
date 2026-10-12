#!/usr/bin/env python3
"""
Recover open passwords for PDFs you own. Uses pikepdf + multiprocessing.
"""
from __future__ import annotations

import argparse
import itertools
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterator, Optional, Sequence

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from worker import try_batch  # noqa: E402

COMMON_PASSWORDS: tuple[str, ...] = (
    "",
    "password",
    "Password",
    "PASSWORD",
    "123456",
    "12345678",
    "1234",
    "12345",
    "0000",
    "1111",
    "pdf",
    "PDF",
    "admin",
    "Admin",
    "letmein",
    "welcome",
    "qwerty",
    "pass",
    "secret",
)

DEFAULT_CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789"
STATE_VERSION = 1


def state_path_for(pdf: Path) -> Path:
    return pdf.with_suffix(pdf.suffix + ".unlock-state.json")


def leet_variants(word: str) -> Iterator[str]:
    subs = {
        "a": "4",
        "A": "4",
        "e": "3",
        "E": "3",
        "i": "1",
        "I": "1",
        "o": "0",
        "O": "0",
        "s": "5",
        "S": "5",
        "t": "7",
        "T": "7",
    }
    chars: list[list[str]] = []
    for ch in word:
        opts = {ch}
        if ch in subs:
            opts.add(subs[ch])
        chars.append(sorted(opts))
    for combo in itertools.product(*chars):
        yield "".join(combo)


def hint_passwords(hints: Sequence[str]) -> Iterator[str]:
    seen: set[str] = set()
    suffix_special = ("", "!", "@", "#", "!@", "!!")
    for raw in hints:
        base_words = {raw, raw.lower(), raw.upper(), raw.capitalize(), raw.swapcase()}
        for w in base_words:
            variants = {w}
            variants.update(leet_variants(w))
            for variant in variants:
                for suf in suffix_special:
                    for candidate in (f"{variant}{suf}",):
                        if candidate not in seen:
                            seen.add(candidate)
                            yield candidate
                    for year in range(1990, 2027):
                        c = f"{variant}{year}{suf}"
                        if c not in seen:
                            seen.add(c)
                            yield c
                    for n in range(1000):
                        c = f"{variant}{n}{suf}"
                        if c not in seen:
                            seen.add(c)
                            yield c


def digit_passwords(max_digits: int) -> Iterator[str]:
    for length in range(1, max_digits + 1):
        upper = 10**length
        for i in range(upper):
            yield str(i).zfill(length) if length > 1 else str(i)


def charset_passwords(charset: str, min_len: int, max_len: int) -> Iterator[str]:
    for length in range(min_len, max_len + 1):
        for combo in itertools.product(charset, repeat=length):
            yield "".join(combo)


def wordlist_passwords(path: Path) -> Iterator[str]:
    with path.open(encoding="utf-8", errors="replace") as fh:
        for line in fh:
            word = line.rstrip("\n\r")
            if word:
                yield word


def skip_iterator(it: Iterator[str], skip: int) -> Iterator[str]:
    for _ in range(skip):
        if next(it, None) is None:
            return
    yield from it


def count_charset(charset: str, min_len: int, max_len: int) -> int:
    n = len(charset)
    return sum(n**length for length in range(min_len, max_len + 1))


def save_unlocked(pdf_path: Path, password: str, out_path: Path) -> None:
    import pikepdf

    with pikepdf.open(pdf_path, password=password) as pdf:
        pdf.save(out_path)


@dataclass
class Phase:
    name: str
    iterator_factory: Callable[[], Iterator[str]]
    skip: int = 0
    total: Optional[int] = None

    def passwords(self) -> Iterator[str]:
        return skip_iterator(self.iterator_factory(), self.skip)


def load_state(path: Path) -> Optional[dict]:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("version") != STATE_VERSION:
            return None
        return data
    except (json.JSONDecodeError, OSError):
        return None


def write_state(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def format_eta(seconds: Optional[float]) -> str:
    if seconds is None:
        return "ETA: unknown"
    if seconds <= 0:
        return "ETA: 0s"
    if seconds < 120:
        return f"ETA: {seconds:.0f}s"
    if seconds < 7200:
        return f"ETA: {seconds / 60:.1f}m"
    return f"ETA: {seconds / 3600:.1f}h"


def run_attack(
    pdf_path: Path,
    phases: list[Phase],
    workers: int,
    batch_size: int,
    state_file: Path,
    resume: bool,
    clear_state: bool,
) -> Optional[str]:
    if clear_state and state_file.is_file():
        state_file.unlink()

    saved = load_state(state_file) if resume else None
    if saved and saved.get("pdf") != str(pdf_path.resolve()):
        print("State file is for a different PDF; ignoring resume.", file=sys.stderr)
        saved = None

    phase_skips: dict[str, int] = {}
    tried_start = 0
    if saved:
        phase_skips = {k: int(v) for k, v in saved.get("phase_skips", {}).items()}
        tried_start = int(saved.get("tried_count", 0))
        for phase in phases:
            phase.skip = phase_skips.get(phase.name, 0)
        print(
            f"Resuming: {tried_start} passwords tried previously "
            f"(last={saved.get('last_password', '')!r}, phase={saved.get('phase', '')})"
        )

    tried = tried_start
    last_password = saved.get("last_password", "") if saved else ""
    start_time = time.monotonic()
    found: Optional[str] = None

    executor = ProcessPoolExecutor(max_workers=workers)
    try:
        for phase in phases:
            if found is not None:
                break

            phase_local = phase.skip
            remaining_in_phase: Optional[int] = None
            if phase.total is not None:
                remaining_in_phase = max(0, phase.total - phase.skip)

            print(f"\n--- Phase: {phase.name} ---")
            if remaining_in_phase is not None:
                print(f"Candidates remaining (approx): {remaining_in_phase:,}")

            it = phase.passwords()
            pending = []

            while found is None:
                while len(pending) < workers * 2 and found is None:
                    batch: list[str] = []
                    while len(batch) < batch_size:
                        try:
                            batch.append(next(it))
                        except StopIteration:
                            break
                    if not batch:
                        break
                    fut = executor.submit(try_batch, (str(pdf_path), batch))
                    fut.batch_len = len(batch)  # type: ignore[attr-defined]
                    fut.batch_last = batch[-1]  # type: ignore[attr-defined]
                    pending.append(fut)

                if not pending:
                    break

                for fut in as_completed(list(pending)):
                    pwd = fut.result()
                    blen = fut.batch_len  # type: ignore[attr-defined]
                    blast = fut.batch_last  # type: ignore[attr-defined]
                    pending.remove(fut)
                    tried += blen
                    phase_local += blen
                    last_password = blast
                    phase_skips[phase.name] = phase_local

                    elapsed = time.monotonic() - start_time
                    rate = tried / elapsed if elapsed > 0 else 0.0
                    eta_sec: Optional[float] = None
                    if remaining_in_phase is not None:
                        rem = max(0, remaining_in_phase - (phase_local - phase.skip))
                        if rate > 0:
                            eta_sec = rem / rate
                    line = (
                        f"tried={tried:,}  last={last_password!r}  "
                        f"{rate:.1f} pwd/s  {format_eta(eta_sec)}"
                    )
                    print(line, end="\r", flush=True)

                    write_state(
                        state_file,
                        {
                            "version": STATE_VERSION,
                            "pdf": str(pdf_path.resolve()),
                            "tried_count": tried,
                            "last_password": last_password,
                            "phase": phase.name,
                            "phase_skips": phase_skips,
                        },
                    )

                    if pwd is not None:
                        found = pwd
                        for p in pending:
                            p.cancel()
                        pending.clear()
                        break

            print()
            phase.skip = phase_local
            if found is not None:
                break
    finally:
        executor.shutdown(wait=found is not None, cancel_futures=found is not None)

    if found is not None and state_file.is_file():
        state_file.unlink()

    return found


def build_phases(args: argparse.Namespace) -> list[Phase]:
    phases: list[Phase] = []

    if args.run_common:
        phases.append(
            Phase("common", lambda: iter(COMMON_PASSWORDS), total=len(COMMON_PASSWORDS))
        )

    if args.hint:
        phases.append(Phase("hints", lambda: hint_passwords(args.hint)))

    if args.wordlist:
        wl = Path(args.wordlist)

        def wl_iter() -> Iterator[str]:
            return wordlist_passwords(wl)

        phases.append(Phase("wordlist", wl_iter))

    if args.digits is not None:
        n = args.digits
        total = sum(10**i for i in range(1, n + 1))
        phases.append(Phase(f"digits-1-{n}", lambda: digit_passwords(n), total=total))

    if args.run_charset_brute:
        charset = args.charset or DEFAULT_CHARSET
        min_l, max_l = args.min_length, args.max_length
        total = count_charset(charset, min_l, max_l)
        phases.append(
            Phase(
                f"charset-{min_l}-{max_l}",
                lambda c=charset, a=min_l, b=max_l: charset_passwords(c, a, b),
                total=total,
            )
        )

    return phases


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
    ns = p.parse_args(argv)

    ns.run_common = not ns.no_common
    ns.run_charset_brute = bool(ns.brute or ns.charset is not None)
    if ns.run_charset_brute:
        total = count_charset(
            ns.charset or DEFAULT_CHARSET,
            ns.min_length,
            ns.max_length,
        )
        print(f"Charset search size: {total:,} candidates", file=sys.stderr)
    return ns


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    pdf_path = args.pdf.resolve()
    if not pdf_path.is_file():
        print(f"File not found: {pdf_path}", file=sys.stderr)
        return 1

    if args.digits is not None and args.digits > 6:
        total = sum(10**i for i in range(1, args.digits + 1))
        print(
            f"Warning: --digits {args.digits} tries up to {total:,} candidates; "
            "this may take a long time.",
            file=sys.stderr,
        )

    phases = build_phases(args)
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
    print(f"Workers: {workers}  Batch size: {args.batch_size}")
    print("For your own files only. Long or random passwords may be impractical to recover.")

    password = run_attack(
        pdf_path,
        phases,
        workers=workers,
        batch_size=args.batch_size,
        state_file=state_file,
        resume=not args.no_resume,
        clear_state=args.clear_state,
    )

    if password is None:
        print("\nPassword not found with the selected attack phases.", file=sys.stderr)
        return 2

    out = args.output or pdf_path.with_name(f"{pdf_path.stem}-unlocked.pdf")
    save_unlocked(pdf_path, password, out.resolve())
    print(f"\nSuccess! Password: {password}")
    print(f"Wrote: {out.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
