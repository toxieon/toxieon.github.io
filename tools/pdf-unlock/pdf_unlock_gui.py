#!/usr/bin/env python3
"""Desktop GUI for pdf-unlock (tkinter; qpdf tests passwords)."""
from __future__ import annotations

import os
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

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


class PdfUnlockApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("pdf-unlock")
        self.minsize(560, 620)
        self._stop_event = threading.Event()
        self._worker: threading.Thread | None = None

        pad = {"padx": 8, "pady": 4}
        frm = ttk.Frame(self, padding=12)
        frm.pack(fill=tk.BOTH, expand=True)

        ttk.Label(
            frm,
            text=(
                "For PDFs you own only. Password-manager random strings require brute force; "
                "long mixed passwords can take years on one PC."
            ),
            wraplength=520,
        ).grid(row=0, column=0, columnspan=3, sticky="w", **pad)

        ttk.Label(frm, text="PDF file").grid(row=1, column=0, sticky="w", **pad)
        self.pdf_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.pdf_var, width=50).grid(row=1, column=1, sticky="ew", **pad)
        ttk.Button(frm, text="Browse…", command=self._browse_pdf).grid(row=1, column=2, **pad)

        brute = ttk.LabelFrame(frm, text="Brute force (default)", padding=8)
        brute.grid(row=2, column=0, columnspan=3, sticky="ew", **pad)
        self.brute_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            brute,
            text="Run ordered brute force (a, b, … Z, 0, … aa, ab, …)",
            variable=self.brute_var,
            command=self._refresh_estimate,
        ).grid(row=0, column=0, columnspan=4, sticky="w")

        charset_frm = ttk.Frame(brute)
        charset_frm.grid(row=1, column=0, columnspan=4, sticky="w", pady=4)
        self.lower_var = tk.BooleanVar(value=True)
        self.upper_var = tk.BooleanVar(value=True)
        self.digits_var = tk.BooleanVar(value=True)
        self.symbols_var = tk.BooleanVar(value=False)
        for col, (text, var) in enumerate(
            [
                ("a–z", self.lower_var),
                ("A–Z", self.upper_var),
                ("0–9", self.digits_var),
                ("symbols", self.symbols_var),
            ]
        ):
            ttk.Checkbutton(charset_frm, text=text, variable=var, command=self._refresh_estimate).grid(
                row=0, column=col, padx=6, sticky="w"
            )

        ttk.Label(brute, text="Length min → max").grid(row=2, column=0, sticky="w")
        len_frm = ttk.Frame(brute)
        len_frm.grid(row=2, column=1, sticky="w")
        self.min_len_var = tk.StringVar(value="1")
        self.max_len_var = tk.StringVar(value="8")
        ttk.Spinbox(len_frm, from_=1, to=16, textvariable=self.min_len_var, width=4, command=self._refresh_estimate).pack(
            side=tk.LEFT
        )
        ttk.Label(len_frm, text=" → ").pack(side=tk.LEFT)
        ttk.Spinbox(len_frm, from_=1, to=16, textvariable=self.max_len_var, width=4, command=self._refresh_estimate).pack(
            side=tk.LEFT
        )
        self.min_len_var.trace_add("write", lambda *_: self._refresh_estimate())
        self.max_len_var.trace_add("write", lambda *_: self._refresh_estimate())

        self.estimate_var = tk.StringVar(value="Select a PDF to estimate search size and time.")
        ttk.Label(brute, textvariable=self.estimate_var, wraplength=500).grid(
            row=3, column=0, columnspan=4, sticky="w", pady=6
        )

        secondary = ttk.LabelFrame(frm, text="Optional (dictionary / hints — usually not for random passwords)", padding=8)
        secondary.grid(row=3, column=0, columnspan=3, sticky="ew", **pad)

        self.common_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(secondary, text="Try empty / common passwords first", variable=self.common_var).grid(
            row=0, column=0, columnspan=2, sticky="w"
        )

        ttk.Label(secondary, text="Hints (one per line)").grid(row=1, column=0, sticky="nw")
        self.hints_text = tk.Text(secondary, height=3, width=36)
        self.hints_text.grid(row=1, column=1, sticky="ew")

        ttk.Label(secondary, text="Wordlist").grid(row=2, column=0, sticky="w")
        self.wordlist_var = tk.StringVar()
        ttk.Entry(secondary, textvariable=self.wordlist_var, width=36).grid(row=2, column=1, sticky="ew")
        ttk.Button(secondary, text="Browse…", command=self._browse_wordlist).grid(row=2, column=2)

        ttk.Label(secondary, text="Digits only (0=off)").grid(row=3, column=0, sticky="w")
        self.digits_only_var = tk.StringVar(value="0")
        ttk.Spinbox(secondary, from_=0, to=12, textvariable=self.digits_only_var, width=6).grid(row=3, column=1, sticky="w")

        prog = ttk.LabelFrame(frm, text="Progress (resume supported)", padding=8)
        prog.grid(row=4, column=0, columnspan=3, sticky="ew", **pad)
        self.phase_var = tk.StringVar(value="Idle")
        self.stats_var = tk.StringVar(value="—")
        ttk.Label(prog, textvariable=self.phase_var).pack(anchor="w")
        ttk.Label(prog, textvariable=self.stats_var).pack(anchor="w")
        ttk.Label(prog, text="Last password tried:").pack(anchor="w", pady=(8, 0))
        self.last_display = tk.StringVar(value="—")
        ttk.Label(prog, textvariable=self.last_display, font=("Consolas", 14), anchor="w").pack(
            fill=tk.X, pady=4
        )

        btn_frm = ttk.Frame(frm)
        btn_frm.grid(row=5, column=0, columnspan=3, **pad)
        self.start_btn = ttk.Button(btn_frm, text="Start", command=self._start)
        self.start_btn.pack(side=tk.LEFT, padx=4)
        self.stop_btn = ttk.Button(btn_frm, text="Stop", command=self._stop, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT, padx=4)
        ttk.Button(btn_frm, text="Refresh estimate", command=self._refresh_estimate).pack(side=tk.LEFT, padx=4)

        frm.columnconfigure(1, weight=1)
        self.pdf_var.trace_add("write", lambda *_: self._refresh_estimate())

    def _browse_pdf(self) -> None:
        path = filedialog.askopenfilename(
            title="Select locked PDF",
            filetypes=[("PDF", "*.pdf"), ("All files", "*.*")],
        )
        if path:
            self.pdf_var.set(path)

    def _browse_wordlist(self) -> None:
        path = filedialog.askopenfilename(title="Select wordlist", filetypes=[("Text", "*.txt"), ("All", "*.*")])
        if path:
            self.wordlist_var.set(path)

    def _collect_options(self) -> AttackOptions | None:
        hints = [ln.strip() for ln in self.hints_text.get("1.0", tk.END).splitlines() if ln.strip()]
        wl = self.wordlist_var.get().strip()
        wordlist = Path(wl) if wl else None
        if wordlist and not wordlist.is_file():
            messagebox.showerror("pdf-unlock", f"Wordlist not found:\n{wordlist}")
            return None

        try:
            min_l = int(self.min_len_var.get())
            max_l = int(self.max_len_var.get())
            digits_only = int(self.digits_only_var.get() or "0")
        except ValueError:
            messagebox.showerror("pdf-unlock", "Length and digits fields must be numbers.")
            return None
        if min_l > max_l:
            messagebox.showerror("pdf-unlock", "Min length cannot exceed max length.")
            return None

        brute = self.brute_var.get()
        if not brute and not self.common_var.get() and not hints and not wordlist and digits_only <= 0:
            messagebox.showerror("pdf-unlock", "Enable brute force or at least one optional mode.")
            return None
        if brute and not (
            self.lower_var.get() or self.upper_var.get() or self.digits_var.get() or self.symbols_var.get()
        ):
            messagebox.showerror("pdf-unlock", "Select at least one character set for brute force.")
            return None

        return AttackOptions(
            brute_force=brute,
            use_lower=self.lower_var.get(),
            use_upper=self.upper_var.get(),
            use_digits=self.digits_var.get(),
            use_symbols=self.symbols_var.get(),
            min_length=min_l,
            max_length=max_l,
            run_common=self.common_var.get(),
            hints=hints,
            wordlist=wordlist,
            digits_only=digits_only if digits_only > 0 else None,
        )

    def _refresh_estimate(self) -> None:
        pdf = self.pdf_var.get().strip()
        if not self.brute_var.get():
            self.estimate_var.set("Brute force off — optional modes only (no full ETA).")
            return
        if not pdf or not Path(pdf).is_file():
            self.estimate_var.set("Select a PDF to estimate brute-force size and time.")
            return
        try:
            qpdf_exe = require_qpdf()
        except QpdfNotFoundError as exc:
            self.estimate_var.set(str(exc))
            return
        try:
            opts = AttackOptions(
                brute_force=True,
                use_lower=self.lower_var.get(),
                use_upper=self.upper_var.get(),
                use_digits=self.digits_var.get(),
                use_symbols=self.symbols_var.get(),
                min_length=int(self.min_len_var.get()),
                max_length=int(self.max_len_var.get()),
            )
        except ValueError:
            return
        est = estimate_brute_search(opts, Path(pdf), qpdf_exe, benchmark=False)
        self.estimate_var.set(
            f"~{est.total_candidates:,} candidates  |  charset size {est.charset_size}  |  "
            f"rough ETA at ~{est.passwords_per_sec:,.0f} pwd/s: {format_duration(est.eta_seconds)} "
            f"(benchmark on Start for a tighter estimate)"
        )

    def _confirm_start(self, options: AttackOptions, pdf_path: Path, qpdf_exe: str) -> bool:
        if not options.brute_force:
            return True
        est = estimate_brute_search(options, pdf_path, qpdf_exe, benchmark=True)
        msg = (
            f"Brute force: lengths {est.min_length}–{est.max_length}, "
            f"{est.charset_size} characters\n"
            f"Candidates: {est.total_candidates:,}\n"
            f"Measured ~{est.passwords_per_sec:,.0f} passwords/sec on this PDF\n"
            f"Estimated time if the password is in range: {format_duration(est.eta_seconds)}\n\n"
        )
        if est.max_length >= 8 and est.charset_size >= 62:
            msg += (
                "8+ character mixed case + digits (and especially with symbols) is often "
                "years on one PC. Password-manager random strings may never finish.\n\n"
            )
        if est.eta_seconds > 86400 * 30:
            msg += "This search is likely impractical on one machine.\n\n"
        msg += "Start anyway? (You can Stop anytime; progress is saved for resume.)"
        return messagebox.askyesno("pdf-unlock — confirm brute force", msg)

    def _start(self) -> None:
        pdf = self.pdf_var.get().strip()
        if not pdf or not Path(pdf).is_file():
            messagebox.showerror("pdf-unlock", "Choose a valid PDF file.")
            return
        options = self._collect_options()
        if options is None:
            return
        try:
            phases = build_phases(options)
        except ValueError as exc:
            messagebox.showerror("pdf-unlock", str(exc))
            return
        try:
            qpdf_exe = require_qpdf()
        except QpdfNotFoundError as exc:
            messagebox.showerror("pdf-unlock", str(exc))
            return

        pdf_path = Path(pdf).resolve()
        if not self._confirm_start(options, pdf_path, qpdf_exe):
            return

        self._stop_event.clear()
        self.start_btn.config(state=tk.DISABLED)
        self.stop_btn.config(state=tk.NORMAL)
        self.phase_var.set("Starting…")
        self.last_display.set("")

        out_path = default_output_path(pdf_path)

        def work() -> None:
            def on_progress(u: ProgressUpdate) -> None:
                self.after(0, lambda u=u: self._update_progress(u))

            password = run_attack(
                pdf_path,
                phases,
                qpdf_exe=qpdf_exe,
                workers=os.cpu_count() or 4,
                batch_size=64,
                state_file=state_path_for(pdf_path),
                resume=True,
                clear_state=False,
                on_progress=on_progress,
                should_stop=self._stop_event.is_set,
                log=lambda _msg: None,
            )
            self.after(0, lambda: self._finished(password, pdf_path, out_path, qpdf_exe))

        self._worker = threading.Thread(target=work, daemon=True)
        self._worker.start()

    def _update_progress(self, u: ProgressUpdate) -> None:
        self.phase_var.set(f"Phase: {u.phase}")
        self.stats_var.set(
            f"Tried: {u.tried:,}  |  {u.rate:.1f} pwd/s  |  {format_eta(u.eta_seconds)}"
        )
        self.last_display.set(u.last_password)

    def _stop(self) -> None:
        self._stop_event.set()
        self.phase_var.set("Stopping… (saving resume state)")

    def _finished(
        self,
        password: str | None,
        pdf_path: Path,
        out_path: Path,
        qpdf_exe: str,
    ) -> None:
        self.start_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)
        if password is None:
            if self._stop_event.is_set():
                self.phase_var.set("Stopped")
                messagebox.showinfo("pdf-unlock", "Stopped. Progress saved; run again to resume.")
            else:
                self.phase_var.set("Not found")
                messagebox.showwarning("pdf-unlock", "Password not found within the selected search space.")
            return
        try:
            unlock_pdf(pdf_path, password, out_path, qpdf_exe)
        except Exception as exc:
            messagebox.showerror("pdf-unlock", f"Found password but decrypt failed:\n{exc}")
            return
        self.phase_var.set("Success")
        messagebox.showinfo(
            "pdf-unlock",
            f"Password: {password}\n\nUnlocked file:\n{out_path}",
        )


def main() -> None:
    app = PdfUnlockApp()
    app.mainloop()


if __name__ == "__main__":
    main()
