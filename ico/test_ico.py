"""Tests: python -m unittest ico.test_ico   (from the repo root; needs pillow, fastapi; httpx optional)."""
import io
import unittest

from PIL import Image

from ico import generate as gen

SIZES = [(16, 16), (32, 32), (48, 48), (256, 256)]


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
                self.assertTrue(any(min(p) > 200 for p in frame.getdata()), f"{name} {size} has no text")

    def test_custom_colours(self):
        im = open_ico(gen.generate_ico("X", "1", bg="#fff", fg="000000"))
        im.size = (48, 48)
        self.assertEqual(im.copy().convert("RGB").getpixel((0, 0)), (255, 255, 255))

    def test_bad_input_raises(self):
        for kw in [dict(name="", version="1"), dict(name="A", version=""), dict(name="A" * 41, version="1"),
                   dict(name="A", version="1", bg="red"), dict(name="A", version="1", fg="#12345"),
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

    def test_ico_bad_colour_is_400(self):
        r = self.client.get("/ico", params={"name": "TipBot", "version": "0.45.1", "bg": "nope"})
        self.assertEqual(r.status_code, 400)
        r = self.client.get("/ico", params={"name": "TipBot"})
        self.assertEqual(r.status_code, 422)


if __name__ == "__main__":
    unittest.main()
