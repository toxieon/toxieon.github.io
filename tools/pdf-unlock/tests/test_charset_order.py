#!/usr/bin/env python3
from __future__ import annotations

import unittest

from core import charset_passwords, compose_charset


class CharsetOrderTest(unittest.TestCase):
    def test_climbs_lower_upper_then_pairs(self) -> None:
        c = compose_charset(True, True, False, False)
        seq = list(charset_passwords(c, 1, 2))
        self.assertEqual(seq[0], "a")
        self.assertEqual(seq[25], "z")
        self.assertEqual(seq[26], "A")
        self.assertEqual(seq[51], "Z")
        self.assertEqual(seq[52], "aa")


if __name__ == "__main__":
    unittest.main()
