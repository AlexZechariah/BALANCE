from __future__ import annotations

from .models import OcrResult
from .providers.paddle_provider import run_paddleocr
from .providers.tesseract_provider import run_tesseract_ocr
from .. import settings


def run_ocr(provider: str, image_paths: list[str]) -> OcrResult:
    provider = (provider or settings.OCR_PROVIDER or "paddleocr").strip().lower()

    if provider == "manual":
      return OcrResult(provider="manual", text="", confidence=0.0, warnings=["manual_extraction_required"])

    if provider == "legacy_textract":
        if not settings.EXTRACTION_ALLOW_LEGACY_TEXTRACT:
            raise RuntimeError("legacy_textract is disabled by default")
        raise RuntimeError("legacy_textract is not part of the v0.5 local worker path")

    if provider == "paddleocr":
        try:
            return run_paddleocr(image_paths)
        except Exception as exc:
            if not settings.OCR_ENABLE_TESSERACT_FALLBACK:
                raise
            fallback = run_tesseract_ocr(image_paths)
            fallback.warnings.extend(["fallback_used", f"paddleocr_failed:{str(exc)[:120]}"])
            return fallback

    if provider == "tesseract":
        return run_tesseract_ocr(image_paths)

    raise RuntimeError(f"unsupported OCR provider: {provider}")
