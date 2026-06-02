import unittest

from app.open_ocr_worker import _provider


class ExtractionProviderTests(unittest.TestCase):
    def test_raw_textract_provider_is_not_canonicalized(self):
        self.assertEqual(_provider("textract"), "textract")

    def test_legacy_textract_provider_remains_explicit(self):
        self.assertEqual(_provider("legacy_textract"), "legacy_textract")


if __name__ == "__main__":
    unittest.main()
