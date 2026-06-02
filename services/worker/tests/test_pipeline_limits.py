import os
import tempfile
import unittest
from unittest import mock

from PIL import Image

from app import settings
from app.pipeline import image_preprocessor, pdf_renderer


class _FakePdf:
    page_count = 2

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class PipelineLimitTests(unittest.TestCase):
    def test_pdf_page_limit_raises_safe_code_before_rendering(self):
        original_limit = settings.OCR_MAX_PAGES_LOCAL
        settings.OCR_MAX_PAGES_LOCAL = 1
        try:
            with mock.patch.object(pdf_renderer.fitz, "open", return_value=_FakePdf()):
                with self.assertRaisesRegex(pdf_renderer.PdfPageLimitExceeded, "pdf_page_limit_exceeded"):
                    pdf_renderer.render_pdf_pages("ignored.pdf")
        finally:
            settings.OCR_MAX_PAGES_LOCAL = original_limit

    def test_image_pixel_limit_raises_safe_code_before_decode(self):
        original_limit = settings.OCR_MAX_IMAGE_PIXELS
        settings.OCR_MAX_IMAGE_PIXELS = 1
        try:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
                image_path = handle.name
            Image.new("RGB", (2, 1), color="white").save(image_path, "PNG")

            with self.assertRaisesRegex(image_preprocessor.ImagePixelLimitExceeded, "image_pixel_limit_exceeded"):
                image_preprocessor.preprocess_image(image_path)
        finally:
            settings.OCR_MAX_IMAGE_PIXELS = original_limit
            if "image_path" in locals() and os.path.exists(image_path):
                os.unlink(image_path)

    def test_preprocessed_image_is_written_as_metadata_free_png(self):
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as handle:
            image_path = handle.name
        try:
            image = Image.new("RGB", (2, 2), color="white")
            image.save(image_path, "JPEG", exif=b"Exif\x00\x00private")

            output_path = image_preprocessor.preprocess_image(image_path)

            self.assertTrue(output_path.endswith(".preprocessed.png"))
            with Image.open(output_path) as output:
                self.assertEqual(output.format, "PNG")
                self.assertFalse(output.info.get("exif"))
        finally:
            for path in {image_path, f"{image_path}.preprocessed.png"}:
                if os.path.exists(path):
                    os.unlink(path)


if __name__ == "__main__":
    unittest.main()
