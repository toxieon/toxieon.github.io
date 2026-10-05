"""Core drawing + ICO encoding for the Neill Data ICO generator.

Used by server.py (HTTP API) and cli.py. Pillow only (MIT-CMU / HPND licence).

Each icon size is drawn natively (not downscaled from 256) so small sizes stay crisp:
  * 16 px          -> short text only (initials, max 2 auto chars, e.g. "TB" for TipBot)
  * 32 px and up   -> line 1 = name (bold), line 2 = version (regular, slightly dimmer)
                      If the full name cannot fit at a legible size, line 1 falls back to
                      the short text. The version line is always shown.
Background: solid colour (default Neill navy) or transparent (bg = "transparent", "none" or
an explicit empty string). Transparent icons keep the text colour (white by default) and add
a subtle outline in a contrasting colour so the text still reads on light or dark wallpapers.
The same layout rules are mirrored in ico/ico-canvas.js for the static page.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
VERSION = (HERE / "VERSION").read_text(encoding="utf-8").strip()

FONT_BOLD = HERE / "fonts" / "DejaVuSans-Bold.ttf"
FONT_REGULAR = HERE / "fonts" / "DejaVuSans.ttf"

DEFAULT_BG = "#0B1F3A"  # Neill navy
DEFAULT_FG = "#FFFFFF"
DEFAULT_SIZES = (16, 32, 48, 256)
ALLOWED_SIZES = (16, 20, 24, 32, 40, 48, 64, 96, 128, 256)

MAX_NAME = 40
MAX_VERSION = 24
MAX_SHORT = 4
VERSION_DIM = 0.80  # version colour = 80 % fg + 20 % bg ("slightly lighter")
VERSION_ALPHA = 0.88  # transparent bg: version line drawn at 88 % opacity instead
OUTLINE_ALPHA = 0.75  # transparent bg: opacity of the contrasting text outline
TRANSPARENT_WORDS = ("", "transparent", "none")

_HEX = re.compile(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_CTRL = re.compile(r"[\x00-\x1f\x7f]")


def parse_hex(value: str | None, default: str) -> tuple[int, int, int]:
    """'#0B1F3A', '0b1f3a', '#fff' -> (r, g, b). Empty/None -> default. Bad input -> ValueError."""
    value = (value or "").strip() or default
    m = _HEX.match(value)
    if not m:
        raise ValueError(f"colour must be hex like #0B1F3A, got {value!r}")
    h = m.group(1)
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def parse_bg(value: str | None) -> tuple[int, int, int] | None:
    """Background colour, or None for transparent.

    None (omitted) -> Neill navy. "", "transparent", "none" (any case) -> transparent.
    """
    if value is None:
        return parse_hex(DEFAULT_BG, DEFAULT_BG)
    if value.strip().lower() in TRANSPARENT_WORDS:
        return None
    return parse_hex(value, DEFAULT_BG)


def clean_text(value: str | None, field: str, max_len: int, required: bool = True) -> str:
    value = _CTRL.sub("", value or "").strip()
    if required and not value:
        raise ValueError(f"{field} is required")
    if len(value) > max_len:
        raise ValueError(f"{field} must be at most {max_len} characters")
    return value


def initials(name: str) -> str:
    """Short text for tiny sizes: 'TipBot' -> 'TB', 'Neill Data' -> 'ND', 'planner' -> 'Pl'."""
    words = [w for w in re.split(r"[\s_\-.]+", name) if w]
    if len(words) >= 2:
        return "".join(w[0] for w in words[:3]).upper()
    word = words[0] if words else name
    caps = re.findall(r"[A-Z0-9]", word[1:])
    if caps:
        return (word[0].upper() + "".join(caps))[:3]
    return word[:2].capitalize()


def safe_filename(name: str, version: str) -> str:
    """'Neill Data', '0.19.1' -> 'Neill-Data-0.19.1.ico' (ASCII only)."""
    stem = f"{name}-{version}" if version else name
    stem = re.sub(r"\s+", "-", stem)
    stem = re.sub(r"[^A-Za-z0-9._-]", "", stem)
    stem = re.sub(r"-{2,}", "-", stem).strip(".-") or "icon"
    return f"{stem[:80]}.ico"


@dataclass(frozen=True)
class IconSpec:
    name: str
    version: str
    short: str
    tiny: str  # text for sizes < 32 (auto initials are capped at 2 characters there)
    bg: tuple[int, int, int] | None  # None = transparent
    fg: tuple[int, int, int]
    sizes: tuple[int, ...]


def make_spec(name, version, *, short=None, bg=None, fg=None, sizes=None) -> IconSpec:
    name = clean_text(name, "name", MAX_NAME)
    version = clean_text(version, "version", MAX_VERSION)
    short = clean_text(short, "short", MAX_SHORT, required=False)
    tiny = short or initials(name)[:2]
    short = short or initials(name)
    sizes = tuple(sorted(set(int(s) for s in (sizes or DEFAULT_SIZES))))
    bad = [s for s in sizes if s not in ALLOWED_SIZES]
    if bad or not sizes:
        raise ValueError(f"sizes must be from {ALLOWED_SIZES}, got {bad or 'none'}")
    return IconSpec(name, version, short, tiny, parse_bg(bg), parse_hex(fg, DEFAULT_FG), sizes)


_font_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def _font(path: Path, px: int) -> ImageFont.FreeTypeFont:
    key = (str(path), px)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(str(path), px)
    return _font_cache[key]


def _fit(draw: ImageDraw.ImageDraw, text: str, path: Path, start: int, minimum: int,
         max_w: int, max_h: int):
    """Largest font size in [minimum, start] whose ink box fits max_w x max_h, else None."""
    for px in range(max(start, minimum), minimum - 1, -1):
        font = _font(path, px)
        l, t, r, b = draw.textbbox((0, 0), text, font=font)
        if r - l <= max_w and b - t <= max_h:
            return font, (l, t, r, b)
    return None


def _mix(a, b, k):
    return tuple(round(x * k + y * (1 - k)) for x, y in zip(a, b))


def outline_width(size: int) -> int:
    return max(1, round(size * 0.02))


def outline_colour(fg) -> tuple[int, int, int]:
    """Dark outline for light text, light outline for dark text."""
    lum = 0.2126 * fg[0] + 0.7152 * fg[1] + 0.0722 * fg[2]
    return (0, 0, 0) if lum >= 128 else (255, 255, 255)


class _Painter:
    """Draws text onto the frame: plain on solid bg, outlined + alpha-correct on transparent bg."""

    def __init__(self, spec: IconSpec, size: int):
        self.size = size
        self.transparent = spec.bg is None
        self.img = Image.new("RGBA", (size, size), (0, 0, 0, 0) if self.transparent else spec.bg + (255,))
        self.draw = ImageDraw.Draw(self.img)
        self.sw = outline_width(size) if self.transparent else 0
        self.outline = outline_colour(spec.fg)

    def _layer(self, xy, text, font, colour, alpha, stroke):
        mask = Image.new("L", (self.size, self.size), 0)
        ImageDraw.Draw(mask).text(xy, text, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
        if alpha < 1:
            mask = mask.point(lambda v: round(v * alpha))
        layer = Image.new("RGBA", (self.size, self.size), colour + (0,))
        layer.putalpha(mask)
        self.img = Image.alpha_composite(self.img, layer)

    def text(self, xy, text, font, colour, alpha=1.0):
        if not self.transparent:
            self.draw.text(xy, text, font=font, fill=colour + (255,))
            return
        self._layer(xy, text, font, self.outline, OUTLINE_ALPHA, self.sw)
        self._layer(xy, text, font, colour, alpha, 0)


def render_size(spec: IconSpec, size: int) -> Image.Image:
    """Draw one square RGBA frame."""
    paint = _Painter(spec, size)
    draw = paint.draw
    pad = max(1, round(size * 0.06)) + paint.sw  # leave room for the outline
    avail = size - 2 * pad
    fg = spec.fg

    if size < 32:
        fit = _fit(draw, spec.tiny, FONT_BOLD, round(size * 0.62), 4, avail, avail)
        if fit:
            font, (l, t, r, b) = fit
            paint.text(((size - (r - l)) / 2 - l, (size - (b - t)) / 2 - t), spec.tiny, font, fg)
        return paint.img

    gap = max(1, round(size * 0.06)) + paint.sw
    name_max_h = round(avail * 0.55)
    min_name = max(8, round(size * 0.05))
    name_fit = _fit(draw, spec.name, FONT_BOLD, round(size * 0.36), min_name, avail, name_max_h)
    line1 = spec.name
    if name_fit is None:  # full name not legible at this size -> initials
        line1 = spec.short
        name_fit = _fit(draw, line1, FONT_BOLD, round(size * 0.36), 4, avail, name_max_h)
    nfont, nbox = name_fit
    ver_start = min(round(size * 0.26), round(nfont.size * 0.82))
    ver_max_h = avail - (nbox[3] - nbox[1]) - gap
    ver_fit = _fit(draw, spec.version, FONT_REGULAR, ver_start, 4, avail, max(ver_max_h, 4))
    if ver_fit is None:  # very long version: shrink to whatever fits, never drop it
        ver_fit = (_font(FONT_REGULAR, 4), draw.textbbox((0, 0), spec.version, font=_font(FONT_REGULAR, 4)))
    vfont, vbox = ver_fit

    nh, vh = nbox[3] - nbox[1], vbox[3] - vbox[1]
    top = (size - (nh + gap + vh)) / 2
    paint.text(((size - (nbox[2] - nbox[0])) / 2 - nbox[0], top - nbox[1]), line1, nfont, fg)
    vxy = ((size - (vbox[2] - vbox[0])) / 2 - vbox[0], top + nh + gap - vbox[1])
    if spec.bg is None:
        paint.text(vxy, spec.version, vfont, fg, VERSION_ALPHA)
    else:
        paint.text(vxy, spec.version, vfont, _mix(spec.fg, spec.bg, VERSION_DIM))
    return paint.img


def render_frames(spec: IconSpec) -> list[Image.Image]:
    return [render_size(spec, s) for s in spec.sizes]


def generate_ico(name, version, *, short=None, bg=None, fg=None, sizes=None) -> bytes:
    """Return the bytes of a multi-size .ico. Raises ValueError on bad input."""
    spec = make_spec(name, version, short=short, bg=bg, fg=fg, sizes=sizes)
    frames = render_frames(spec)
    largest = frames[-1]
    buf = io.BytesIO()
    largest.save(buf, format="ICO", sizes=[(s, s) for s in spec.sizes], append_images=frames[:-1])
    return buf.getvalue()


def generate_png(name, version, size=256, **kw) -> bytes:
    """Single PNG frame (handy for previews / README samples)."""
    spec = make_spec(name, version, sizes=[size], **kw)
    buf = io.BytesIO()
    render_size(spec, size).save(buf, format="PNG")
    return buf.getvalue()
