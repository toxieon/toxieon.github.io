"""Command line front end for the Neill Data ICO generator.

    python -m ico.cli TipBot 0.45.1 -o TipBot.ico      (from the repo root)
    python ico/cli.py "Neill Data" 0.19.1               (writes Neill-Data-0.19.1.ico)
    python ico/cli.py TipBot 0.45.1 --png preview.png   (also write a 256px PNG preview)
    python ico/cli.py TipBot 0.45.1 --bg transparent    (alpha background, outlined text; also: none)
"""
from __future__ import annotations

import argparse
import os
import sys

try:
    from . import generate as gen
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import generate as gen  # type: ignore[no-redef]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="ico.cli", description="Make a two-line (name + version) multi-size .ico")
    p.add_argument("name", help="line 1, e.g. TipBot")
    p.add_argument("version", help="line 2, e.g. 0.45.1")
    p.add_argument("-o", "--output", help="output .ico path (default: <name>-<version>.ico in the current folder)")
    p.add_argument("--bg", default=None,
                   help=f"background hex (default {gen.DEFAULT_BG}), or 'transparent' / 'none' for an alpha background")
    p.add_argument("--fg", default=gen.DEFAULT_FG, help=f"text hex (default {gen.DEFAULT_FG})")
    p.add_argument("--short", help="text for the 16px frame (default: initials, e.g. TB)")
    p.add_argument("--sizes", default=",".join(map(str, gen.DEFAULT_SIZES)),
                   help="comma list of sizes (default 16,32,48,256)")
    p.add_argument("--png", help="also write a 256px PNG preview here")
    p.add_argument("--version-info", action="version", version=f"ico generator {gen.VERSION}")
    a = p.parse_args(argv)
    try:
        sizes = [int(s) for s in a.sizes.split(",") if s.strip()]
        data = gen.generate_ico(a.name, a.version, short=a.short, bg=a.bg, fg=a.fg, sizes=sizes)
        out = a.output or gen.safe_filename(gen.clean_text(a.name, "name", gen.MAX_NAME),
                                            gen.clean_text(a.version, "version", gen.MAX_VERSION))
        with open(out, "wb") as f:
            f.write(data)
        if a.png:
            with open(a.png, "wb") as f:
                f.write(gen.generate_png(a.name, a.version, 256, short=a.short, bg=a.bg, fg=a.fg))
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
