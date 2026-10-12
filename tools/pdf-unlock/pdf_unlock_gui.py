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
        self.minsize(520, 480)
        self._stop_event = threading.Event()
        self._worker: threading.Thread | None = None

        pad = {"padx": 8, "pady": 4}
        frm = ttk.Frame(self, padding=12)
        frm.pack(fill=tk.BOTH, expand=True)

        ttk.Label(
            frm,
            text="Recover passwords on PDFs you own only. Strong random passwords may be impossible to recover.",
            wraplength=480,
        ).grid(row=0, column=0, columnspan=3, sticky="w", **pad)

        ttk.Label(frm, text="PDF file").grid(row=1, column=0, sticky="w", **pad)
        self.pdf_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.pdf_var, width=48).grid(row=1, column=1, sticky="ew", **pad)
        ttk.Button(frm, text="Browse…", command=self._browse_pdf).grid(row=1, column=2, **pad)

        ttk.Label(frm, text="Hints (one per line)").grid(row=2, column=0, sticky="nw", **pad)
        self.hints_text = tk.Text(frm, height=4, width=40)
        self.hints_text.grid(row=2, column=1, columnspan=2, sticky="ew", **pad)

        ttk.Label(frm, text="Wordlist").grid(row=3, column=0, sticky="w", **pad)
        self.wordlist_var = tk.StringVar()
        ttk.Entry(frm, textvariable=self.wordlist_var, width=48).grid(row=3, column=1, sticky="ew", **pad)
        ttk.Button(frm, text="Browse…", command=self._browse_wordlist).grid(row=3, column=2, **pad)

        opts = ttk.LabelFrame(frm, text="Attack options", padding=8)
        opts.grid(row=4, column=0, columnspan=3, sticky="ew", **pad)

        self.common_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(opts, text="Try empty / common passwords first", variable=self.common_var).grid(
            row=0, column=0, columnspan=2, sticky="w"
        )

        ttk.Label(opts, text="Digits max (0 = off)").grid(row=1, column=0, sticky="w")
        self.digits_var = tk.StringVar(value="0")
        ttk.Spinbox(opts, from_=0, to=12, textvariable=self.digits_var, width=6).grid(row=1, column=1, sticky="w")

        self.brute_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(opts, text="Charset brute (lowercase+digits default)", variable=self.brute_var).grid(
            row=2, column=0, columnspan=2, sticky="w"
        )

        ttk.Label(opts, text="Charset").grid(row=3, column=0, sticky="w")
        self.charset_var = tk.StringVar()
        ttk.Entry(opts, textvariable=self.charset_var, width=36).grid(row=3, column=1, sticky="ew")

        ttk.Label(opts, text="Min / max length").grid(row=4, column=0, sticky="w")
        len_frm = ttk.Frame(opts)
        len_frm.grid(row=4, column=1, sticky="w")
        self.min_len_var = tk.StringVar(value="1")
        self.max_len_var = tk.StringVar(value="5")
        ttk.Spinbox(len_frm, from_=1, to=12, textvariable=self.min_len_var, width=4).pack(side=tk.LEFT)
        ttk.Label(len_frm, text=" – ").pack(side=tk.LEFT)
        ttk.Spinbox(len_frm, from_=1, to=12, textvariable=self.max_len_var, width=4).pack(side=tk.LEFT)

        prog = ttk.LabelFrame(frm, text="Progress", padding=8)
        prog.grid(row=5, column=0, columnspan=3, sticky="ew", **pad)
        self.phase_var = tk.StringVar(value="Idle")
        self.stats_var = tk.StringVar(value="—")
        self.last_var = tk.StringVar(value="—")
        ttk.Label(prog, textvariable=self.phase_var).pack(anchor="w")
        ttk.Label(prog, textvariable=self.stats_var).pack(anchor="w")
        ttk.Label(prog, textvariable=self.last_var).pack(anchor="w")

        btn_frm = ttk.Frame(frm)
        btn_frm.grid(row=6, column=0, columnspan=3, **pad)
        self.start_btn = ttk.Button(btn_frm, text="Start", command=self._start)
        self.start_btn.pack(side=tk.LEFT, padx=4)
        self.stop_btn = ttk.Button(btn_frm, text="Stop", command=self._stop, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT, padx=4)

        frm.columnconfigure(1, weight=1)

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

        digits_raw = self.digits_var.get().strip() or "0"
        try:
            digits_n = int(digits_raw)
        except ValueError:
            messagebox.showerror("pdf-unlock", "Digits max must be a number.")
            return None
        digits = digits_n if digits_n > 0 else None
        if digits is not None and digits > 6:
            if not messagebox.askyesno(
                "pdf-unlock",
                f"Digits max {digits} may take a very long time. Continue?",
            ):
                return None

        charset = self.charset_var.get().strip() or None
        brute = self.brute_var.get() or bool(charset)
        try:
            min_l = int(self.min_len_var.get())
            max_l = int(self.max_len_var.get())
        except ValueError:
            messagebox.showerror("pdf-unlock", "Min/max length must be numbers.")
            return None

        return AttackOptions(
            run_common=self.common_var.get(),
            hints=hints,
            wordlist=wordlist,
            digits=digits,
            charset=charset,
            brute=brute,
            min_length=min_l,
            max_length=max_l,
        )

    def _start(self) -> None:
        pdf = self.pdf_var.get().strip()
        if not pdf or not Path(pdf).is_file():
            messagebox.showerror("pdf-unlock", "Choose a valid PDF file.")
            return
        options = self._collect_options()
        if options is None:
            return
        phases = build_phases(options)
        if not phases:
            messagebox.showerror("pdf-unlock", "Enable at least one attack option.")
            return
        try:
            qpdf_exe = require_qpdf()
        except QpdfNotFoundError as exc:
            messagebox.showerror("pdf-unlock", str(exc))
            return

        self._stop_event.clear()
        self.start_btn.config(state=tk.DISABLED)
        self.stop_btn.config(state=tk.NORMAL)
        self.phase_var.set("Starting…")

        pdf_path = Path(pdf).resolve()
        out_path = default_output_path(pdf_path)

        def work() -> None:
            def on_progress(u: ProgressUpdate) -> None:
                self.after(
                    0,
                    lambda: self._update_progress(u),
                )

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
        self.last_var.set(f"Last: {u.last_password!r}")

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
                messagebox.showwarning("pdf-unlock", "Password not found with these options.")
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
