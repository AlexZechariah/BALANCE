from __future__ import annotations

import time

from .models import OcrResult
from .providers.paddle_provider import run_paddleocr
from .providers.tesseract_provider import run_tesseract_ocr
from .. import settings
from ..observability import record_ocr_fallback, record_ocr_result, start_span


def run_ocr(provider: str, image_paths: list[str]) -> OcrResult:
    provider = (provider or settings.OCR_PROVIDER or "paddleocr").strip().lower()

    if provider == "manual":
        return _recorded_provider_run("manual", lambda: OcrResult(provider="manual", text="", confidence=0.0, warnings=["manual_extraction_required"]))

    if provider == "legacy_textract":
        if not settings.EXTRACTION_ALLOW_LEGACY_TEXTRACT:
            raise RuntimeError("legacy_textract is disabled by default")
        raise RuntimeError("legacy_textract is not part of the v0.5 local worker path")

    if provider == "paddleocr":
        try:
            return _recorded_provider_run("paddleocr", lambda: run_paddleocr(image_paths))
        except Exception as exc:
            if not settings.OCR_ENABLE_TESSERACT_FALLBACK:
                raise
            record_ocr_fallback("paddleocr", "tesseract", exc)
            fallback = _recorded_provider_run("tesseract", lambda: run_tesseract_ocr(image_paths))
            fallback.warnings.extend(["fallback_used", "paddleocr_failed"])
            return fallback

    if provider == "tesseract":
        return _recorded_provider_run("tesseract", lambda: run_tesseract_ocr(image_paths))

    raise RuntimeError(f"unsupported OCR provider: {provider}")


def _recorded_provider_run(provider: str, fn):
    start = time.perf_counter()
    try:
        with start_span("worker.ocr", {"balance.worker.ocr_provider": provider}):
            result = fn()
        record_ocr_result(provider, "success", time.perf_counter() - start)
        return result
    except Exception as exc:
        record_ocr_result(provider, "failure", time.perf_counter() - start, exc)
        raise
