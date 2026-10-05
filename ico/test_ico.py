"""Tests: python -m unittest ico.test_ico   (from the repo root; needs pillow, fastapi; httpx optional)."""
import io
import unittest

from PIL import Image

from ico import generate as gen

SIZES = [(16, 16), (32, 32), (48, 48), (256, 256)]


def pixels(img: Image.Image):
    """Pixel tuples without Image.getdata (deprecated in Pillow 12)."""
    n = len(img.getbands())
    raw = img.tobytes()
    return [tuple(raw[i:i + n]) for i in range(0, len(raw), n)]


def open_ico(data: bytes) -> Image.Image:
    im = Image.open(io.BytesIO(data))
    im.load()
    return im


class GenerateTests(unittest.TestCase):
    def test_tipbot_and_neill_data_are_valid_multi_size_icos(self):
        for name, version in [("TipBot", "0.45.1"), ("Neill Data", "0.19.1")]:
            data = gen.generate_ico(name, version)
            self.assertEqual(data[:4], b"\x00\x00\x01\x00")
            self.assertEqual(int.from_bytes(data[4:6], "little"), 4)
            im = open_ico(data)
            self.assertEqual(im.format, "ICO")
            self.assertEqual(sorted(im.info["sizes"]), SIZES)
            for size in SIZES:
                im.size = size
                frame = im.copy().convert("RGB")
                self.assertEqual(frame.size, size)
                # corner is navy background, and some pixels are near-white text
                self.assertEqual(frame.getpixel((0, 0)), (0x0B, 0x1F, 0x3A))
                self.assertTrue(any(min(p) > 200 for p in pixels(frame)), f"{name} {size} has no text")

    def test_custom_colours(self):
        im = open_ico(gen.generate_ico("X", "1", bg="#fff", fg="000000"))
        im.size = (48, 48)
        self.assertEqual(im.copy().convert("RGB").getpixel((0, 0)), (255, 255, 255))

    def test_transparent_background_keeps_alpha_and_visible_text(self):
        for bg in ["transparent", "none", "TRANSPARENT", " None ", ""]:
            im = open_ico(gen.generate_ico("TipBot", "0.45.1", bg=bg))
            self.assertEqual(sorted(im.info["sizes"]), SIZES, bg)
            for size in SIZES:
                im.size = size
                frame = im.copy()
                self.assertEqual(frame.mode, "RGBA", (bg, size))
                alpha = frame.getchannel("A")
                self.assertEqual(alpha.getpixel((0, 0)), 0, "corner should be fully transparent")
                px = list(pixels(frame))
                self.assertTrue(any(a == 0 for *_, a in px))
                # white text exists (opaque near-white) and so does the dark outline
                self.assertTrue(any(a > 200 and min(r, g, b) > 200 for r, g, b, a in px), (bg, size))
                self.assertTrue(any(a > 100 and max(r, g, b) < 60 for r, g, b, a in px), (bg, size))

    def test_transparent_with_dark_fg_uses_light_outline(self):
        im = open_ico(gen.generate_ico("TipBot", "0.45.1", bg="none", fg="#0B1F3A"))
        im.size = (256, 256)
        px = list(pixels(im.copy()))
        self.assertTrue(any(a > 100 and min(r, g, b) > 200 for r, g, b, a in px))

    def test_omitted_bg_is_navy(self):
        self.assertEqual(gen.make_spec("A", "1").bg, (0x0B, 0x1F, 0x3A))
        self.assertIsNone(gen.make_spec("A", "1", bg="Transparent").bg)

    def test_bad_input_raises(self):
        for kw in [dict(name="", version="1"), dict(name="A", version=""), dict(name="A" * 41, version="1"),
                   dict(name="A", version="1", bg="red"), dict(name="A", version="1", bg="clear"), dict(name="A", version="1", fg="#12345"),
                   dict(name="A", version="1", sizes=[512])]:
            with self.assertRaises(ValueError, msg=kw):
                gen.generate_ico(**kw)

    def test_initials_and_filenames(self):
        self.assertEqual(gen.initials("TipBot"), "TB")
        self.assertEqual(gen.initials("Neill Data"), "ND")
        self.assertEqual(gen.initials("Neill Data Suite"), "NDS")
        self.assertEqual(gen.initials("planner"), "Pl")
        self.assertEqual(gen.safe_filename("TipBot", "0.45.1"), "TipBot-0.45.1.ico")
        self.assertEqual(gen.safe_filename("Neill Data", "0.19.1"), "Neill-Data-0.19.1.ico")
        self.assertEqual(gen.safe_filename('../"evil"\r\n', "1"), "evil-1.ico")


def png_with_alpha(w=400, h=300) -> bytes:
    from PIL import ImageDraw
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse((w * 0.1, h * 0.1, w * 0.9, h * 0.9), fill=(255, 80, 0, 255))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()


def encode(im: Image.Image, fmt: str, **kw) -> bytes:
    buf = io.BytesIO()
    im.save(buf, fmt, **kw)
    return buf.getvalue()


def palette_png() -> Image.Image:
    from PIL import ImageDraw
    im = Image.new("P", (300, 300), 0)  # index 0 = transparent background
    im.putpalette([0, 0, 0, 255, 80, 0] + [0] * 762)
    ImageDraw.Draw(im).ellipse((30, 30, 270, 270), fill=1)
    return im


class ImageUploadTests(unittest.TestCase):
    def test_png_with_alpha_keeps_alpha_and_paints_no_background(self):
        im = open_ico(gen.image_to_ico(png_with_alpha()))
        self.assertEqual(sorted(im.info["sizes"]), SIZES)
        for size in SIZES:
            im.size = size
            f = im.copy()
            self.assertEqual(f.mode, "RGBA")
            self.assertEqual(f.getpixel((0, 0)), (0, 0, 0, 0), size)  # transparent, not navy
            self.assertEqual(f.getpixel((size[0] // 2, size[1] // 2)), (255, 80, 0, 255), size)
            self.assertFalse(any(p[:3] == (0x0B, 0x1F, 0x3A) and p[3] for p in pixels(f)))

    def test_jpeg_is_opaque_inside_and_padded_transparent_when_not_square(self):
        im = open_ico(gen.image_to_ico(encode(Image.new("RGB", (640, 480), (10, 200, 30)), "JPEG", quality=95)))
        self.assertEqual(sorted(im.info["sizes"]), SIZES)
        im.size = (256, 256)
        f = im.copy()
        self.assertEqual(f.getpixel((0, 0))[3], 0)        # padding band (top) is transparent
        self.assertEqual(f.getpixel((128, 128))[3], 255)  # picture area is opaque
        r, g, b, _ = f.getpixel((128, 128))
        self.assertTrue(abs(r - 10) < 8 and abs(g - 200) < 8 and abs(b - 30) < 8)

    def test_webp_ico_and_palette_png_inputs(self):
        rgba = Image.open(io.BytesIO(png_with_alpha(300, 300)))
        for data in [encode(rgba, "WEBP", lossless=True), encode(rgba, "ICO", sizes=[(64, 64), (128, 128)]),
                     encode(palette_png(), "PNG", transparency=0)]:
            im = open_ico(gen.image_to_ico(data))
            self.assertEqual(sorted(im.info["sizes"]), SIZES)
            im.size = (48, 48)
            self.assertEqual(im.copy().getpixel((0, 0))[3], 0)

    def test_custom_sizes_and_filenames(self):
        im = open_ico(gen.image_to_ico(png_with_alpha(), "16,64"))
        self.assertEqual(sorted(im.info["sizes"]), [(16, 16), (64, 64)])
        self.assertEqual(gen.image_filename("My Logo.png"), "My-Logo.ico")
        self.assertEqual(gen.image_filename("C:\\fakepath\\logo.webp"), "logo.ico")
        self.assertEqual(gen.image_filename(None), "icon.ico")

    def test_rejects_bad_uploads(self):
        too_many = encode(Image.new("1", (8000, 5001)), "PNG")  # 40,005,000 px, tiny file
        for data in [b"", b"not an image", encode(Image.new("RGB", (8, 8)), "GIF"), too_many,
                     b"x" * (gen.MAX_UPLOAD_BYTES + 1)]:
            with self.assertRaises(ValueError):
                gen.image_to_ico(data)
        with self.assertRaises(ValueError):
            gen.image_to_ico(png_with_alpha(), "512")

    def test_text_path_unchanged(self):
        import hashlib
        # same bytes as 0.1.1-0.1.3 for the default navy text icon
        self.assertEqual(hashlib.sha1(gen.generate_ico("TipBot", "0.45.1")).hexdigest(),
                         "a0ff57e7bdc871c93db0481f3b6e6903269b3a0d")


try:
    from fastapi.testclient import TestClient  # needs httpx
    from ico.server import app
except Exception:  # pragma: no cover
    TestClient = None


@unittest.skipIf(TestClient is None, "httpx not installed (pip install httpx to run HTTP tests)")
class ServerTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health(self):
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "ok")
        self.assertEqual(r.json()["version"], gen.VERSION)

    def test_ico_download(self):
        r = self.client.get("/ico", params={"name": "TipBot", "version": "0.45.1"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers["content-type"], "image/x-icon")
        self.assertIn('attachment; filename="TipBot-0.45.1.ico"', r.headers["content-disposition"])
        self.assertEqual(sorted(open_ico(r.content).info["sizes"]), SIZES)

    def test_ico_transparent(self):
        for bg in ["transparent", "none", ""]:
            r = self.client.get("/ico", params={"name": "TipBot", "version": "0.45.1", "bg": bg})
            self.assertEqual(r.status_code, 200, bg)
            self.assertEqual(r.headers["content-type"], "image/x-icon")
            im = open_ico(r.content)
            im.size = (48, 48)
            self.assertEqual(im.copy().getchannel("A").getpixel((0, 0)), 0)

    def test_post_image_upload(self):
        r = self.client.post("/ico", files={"image": ("My Logo.png", png_with_alpha(), "image/png")})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.headers["content-type"], "image/x-icon")
        self.assertIn('filename="My-Logo.ico"', r.headers["content-disposition"])
        im = open_ico(r.content)
        self.assertEqual(sorted(im.info["sizes"]), SIZES)
        im.size = (32, 32)
        self.assertEqual(im.copy().getpixel((0, 0)), (0, 0, 0, 0))

    def test_post_file_alias_and_sizes(self):
        jpg = encode(Image.new("RGB", (100, 100), (200, 0, 0)), "JPEG")
        r = self.client.post("/ico", files={"file": ("p.jpg", jpg, "image/jpeg")}, data={"sizes": "16,48"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(sorted(open_ico(r.content).info["sizes"]), [(16, 16), (48, 48)])

    def test_post_errors(self):
        self.assertEqual(self.client.post("/ico", data={"sizes": "16"}).status_code, 400)
        r = self.client.post("/ico", files={"image": ("x.txt", b"hello", "text/plain")})
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/ico", files={"image": ("big.png", b"x" * (gen.MAX_UPLOAD_BYTES + 1), "image/png")})
        self.assertEqual(r.status_code, 413)

    def test_cors_for_neilldata_and_localhost_only(self):
        for origin, allowed in [("https://www.neilldata.com", True), ("http://127.0.0.1:5500", True),
                                ("https://evil.example", False)]:
            r = self.client.get("/health", headers={"Origin": origin})
            self.assertEqual(r.headers.get("access-control-allow-origin") == origin, allowed, origin)

    def test_ico_bad_colour_is_400(self):
        r = self.client.get("/ico", params={"name": "TipBot", "version": "0.45.1", "bg": "nope"})
        self.assertEqual(r.status_code, 400)
        r = self.client.get("/ico", params={"name": "TipBot"})
        self.assertEqual(r.status_code, 422)


if __name__ == "__main__":
    unittest.main()
