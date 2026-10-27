"""Password candidates, attack orchestration, and shared config (stdlib + qpdf CLI)."""
from __future__ import annotations

import itertools
import json
import string
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterator, Optional, Sequence

from qpdf_util import decrypt_pdf, test_password
from worker import try_batch

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

# Ordered for brute force: a-z, A-Z, 0-9, then symbols.
SYMBOL_CHARSET = "!@#$%^&*()-_=+[]{}|;:,.<>?~`"

STATE_VERSION = 1

# Conservative guess before benchmark (password manager PDFs vary).
FALLBACK_PASSWORDS_PER_SEC = 150.0


@dataclass
class AttackOptions:
    """Default: full brute force over increasing length (password-manager style)."""

    brute_force: bool = True
    use_lower: bool = True
    use_upper: bool = True
    use_digits: bool = True
    use_symbols: bool = False
    custom_charset: Optional[str] = None
    min_length: int = 1
    max_length: int = 8
    run_common: bool = False
    hints: list[str] = field(default_factory=list)
    wordlist: Optional[Path] = None
    digits_only: Optional[int] = None


@dataclass
class ProgressUpdate:
    tried: int
    last_password: str
    rate: float
    eta_seconds: Optional[float]
    phase: str


@dataclass
class SearchEstimate:
    total_candidates: int
    passwords_per_sec: float
    eta_seconds: float
    charset_size: int
    min_length: int
    max_length: int


ProgressCallback = Callable[[ProgressUpdate], None]
ShouldStopCallback = Callable[[], bool]


def state_path_for(pdf: Path) -> Path:
    return pdf.with_suffix(pdf.suffix + ".unlock-state.json")


def compose_charset(
    use_lower: bool = True,
    use_upper: bool = True,
    use_digits: bool = True,
    use_symbols: bool = False,
    custom: Optional[str] = None,
) -> str:
    if custom:
        return custom
    parts: list[str] = []
    if use_lower:
        parts.append(string.ascii_lowercase)
    if use_upper:
        parts.append(string.ascii_uppercase)
    if use_digits:
        parts.append(string.digits)
    if use_symbols:
        parts.append(SYMBOL_CHARSET)
    return "".join(parts)


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
        if not raw.strip():
            continue
        base_words = {raw, raw.lower(), raw.upper(), raw.capitalize(), raw.swapcase()}
        for w in base_words:
            variants = {w}
            variants.update(leet_variants(w))
            for variant in variants:
                for suf in suffix_special:
                    candidate = f"{variant}{suf}"
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
    """Lexicographic product: a, b, … z, A, … (charset order defines climb)."""
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
    if n == 0:
        return 0
    return sum(n**length for length in range(min_len, max_len + 1))


def brute_charset_for_options(options: AttackOptions) -> str:
    return compose_charset(
        options.use_lower,
        options.use_upper,
        options.use_digits,
        options.use_symbols,
        options.custom_charset,
    )


def benchmark_password_rate(
    pdf_path: Path,
    qpdf_exe: str,
    duration_sec: float = 0.75,
) -> float:
    """Measure wrong-password attempts/sec on this PDF (single-threaded)."""
    charset = string.ascii_lowercase
    deadline = time.monotonic() + duration_sec
    attempts = 0
    length = 1
    idx = 0
    while time.monotonic() < deadline:
        pwd = charset[idx % len(charset)] * length
        idx += 1
        if idx % len(charset) == 0:
            length = min(length + 1, 4)
        test_password(pdf_path, pwd, qpdf_exe=qpdf_exe)
        attempts += 1
    elapsed = duration_sec if duration_sec > 0 else 1.0
    rate = attempts / elapsed
    cpus = max(1, __import__("os").cpu_count() or 1)
    return max(rate * cpus * 0.85, 1.0)


def estimate_brute_search(
    options: AttackOptions,
    pdf_path: Path,
    qpdf_exe: str,
    benchmark: bool = True,
) -> SearchEstimate:
    charset = brute_charset_for_options(options)
    total = count_charset(charset, options.min_length, options.max_length)
    if benchmark and pdf_path.is_file():
        rate = benchmark_password_rate(pdf_path, qpdf_exe)
    else:
        rate = FALLBACK_PASSWORDS_PER_SEC * max(1, __import__("os").cpu_count() or 1)
    eta = total / rate if rate > 0 else float("inf")
    return SearchEstimate(
        total_candidates=total,
        passwords_per_sec=rate,
        eta_seconds=eta,
        charset_size=len(charset),
        min_length=options.min_length,
        max_length=options.max_length,
    )


def format_duration(seconds: float) -> str:
    if seconds == float("inf") or seconds < 0:
        return "unknown"
    if seconds < 120:
        return f"{seconds:.0f} seconds"
    if seconds < 86400:
        return f"{seconds / 3600:.1f} hours" if seconds >= 7200 else f"{seconds / 60:.1f} minutes"
    if seconds < 86400 * 365:
        return f"{seconds / 86400:.1f} days"
    return f"{seconds / (86400 * 365):.1f} years"


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
    if seconds < 86400 * 7:
        return f"ETA: {seconds / 3600:.1f}h"
    return f"ETA: {format_duration(seconds)}"


def build_phases(options: AttackOptions) -> list[Phase]:
    phases: list[Phase] = []

    if options.run_common:
        phases.append(
            Phase("common", lambda: iter(COMMON_PASSWORDS), total=len(COMMON_PASSWORDS))
        )

    if options.hints:
        hints = list(options.hints)
        phases.append(Phase("hints", lambda: hint_passwords(hints)))

    if options.wordlist:
        wl = Path(options.wordlist)

        def wl_iter() -> Iterator[str]:
            return wordlist_passwords(wl)

        phases.append(Phase("wordlist", wl_iter))

    if options.digits_only is not None:
        n = options.digits_only
        total = sum(10**i for i in range(1, n + 1))
        phases.append(Phase(f"digits-1-{n}", lambda: digit_passwords(n), total=total))

    if options.brute_force:
        charset = brute_charset_for_options(options)
        if not charset:
            raise ValueError("Brute force enabled but charset is empty (select at least one set).")
        min_l, max_l = options.min_length, options.max_length
        total = count_charset(charset, min_l, max_l)
        phases.append(
            Phase(
                f"brute-{min_l}-{max_l}",
                lambda c=charset, a=min_l, b=max_l: charset_passwords(c, a, b),
                total=total,
            )
        )

    return phases


def run_attack(
    pdf_path: Path,
    phases: list[Phase],
    qpdf_exe: str,
    workers: int,
    batch_size: int,
    state_file: Path,
    resume: bool,
    clear_state: bool,
    on_progress: Optional[ProgressCallback] = None,
    should_stop: Optional[ShouldStopCallback] = None,
    log: Callable[[str], None] = print,
) -> Optional[str]:
    if clear_state and state_file.is_file():
        state_file.unlink()

    saved = load_state(state_file) if resume else None
    if saved and saved.get("pdf") != str(pdf_path.resolve()):
        log("State file is for a different PDF; ignoring resume.")
        saved = None

    phase_skips: dict[str, int] = {}
    tried_start = 0
    if saved:
        phase_skips = {k: int(v) for k, v in saved.get("phase_skips", {}).items()}
        tried_start = int(saved.get("tried_count", 0))
        for phase in phases:
            phase.skip = phase_skips.get(phase.name, 0)
        log(
            f"Resuming: {tried_start} passwords tried previously "
            f"(last={saved.get('last_password', '')!r}, phase={saved.get('phase', '')})"
        )

    tried = tried_start
    last_password = saved.get("last_password", "") if saved else ""
    start_time = time.monotonic()
    found: Optional[str] = None
    stopped = False

    def emit_progress(phase_name: str, remaining: Optional[int], phase_local: int, phase: Phase) -> None:
        nonlocal tried, last_password
        elapsed = time.monotonic() - start_time
        rate = tried / elapsed if elapsed > 0 else 0.0
        eta_sec: Optional[float] = None
        if remaining is not None:
            rem = max(0, remaining - (phase_local - phase.skip))
            if rate > 0:
                eta_sec = rem / rate
        if on_progress:
            on_progress(
                ProgressUpdate(
                    tried=tried,
                    last_password=last_password,
                    rate=rate,
                    eta_seconds=eta_sec,
                    phase=phase_name,
                )
            )

    executor = ProcessPoolExecutor(max_workers=workers)
    try:
        for phase in phases:
            if found is not None or stopped:
                break

            phase_local = phase.skip
            remaining_in_phase: Optional[int] = None
            if phase.total is not None:
                remaining_in_phase = max(0, phase.total - phase.skip)

            log(f"\n--- Phase: {phase.name} ---")
            if remaining_in_phase is not None:
                log(f"Candidates remaining (approx): {remaining_in_phase:,}")

            it = phase.passwords()
            pending = []

            while found is None and not stopped:
                if should_stop and should_stop():
                    stopped = True
                    break

                while len(pending) < workers * 2 and found is None and not stopped:
                    if should_stop and should_stop():
                        stopped = True
                        break
                    batch: list[str] = []
                    while len(batch) < batch_size:
                        try:
                            batch.append(next(it))
                        except StopIteration:
                            break
                    if not batch:
                        break
                    fut = executor.submit(try_batch, (qpdf_exe, str(pdf_path), batch))
                    fut.batch_len = len(batch)  # type: ignore[attr-defined]
                    fut.batch_last = batch[-1]  # type: ignore[attr-defined]
                    pending.append(fut)

                if not pending or stopped:
                    break

                for fut in as_completed(list(pending)):
                    if should_stop and should_stop():
                        stopped = True
                        break
                    pwd = fut.result()
                    blen = fut.batch_len  # type: ignore[attr-defined]
                    blast = fut.batch_last  # type: ignore[attr-defined]
                    pending.remove(fut)
                    tried += blen
                    phase_local += blen
                    last_password = blast
                    phase_skips[phase.name] = phase_local

                    emit_progress(phase.name, remaining_in_phase, phase_local, phase)

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

            log("")
            phase.skip = phase_local
            if found is not None or stopped:
                break
    finally:
        executor.shutdown(wait=found is not None and not stopped, cancel_futures=True)

    if found is not None and state_file.is_file():
        state_file.unlink()

    return found


def unlock_pdf(
    pdf_path: Path,
    password: str,
    out_path: Path,
    qpdf_exe: str,
) -> None:
    decrypt_pdf(pdf_path, password, out_path, qpdf_exe=qpdf_exe)


def default_output_path(pdf_path: Path) -> Path:
    return pdf_path.with_name(f"{pdf_path.stem}-unlocked.pdf")
