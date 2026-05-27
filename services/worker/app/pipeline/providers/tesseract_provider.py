from __future__ import annotations

from ... import ocr, settings
from ..models import OcrResult


def run_tesseract_ocr(image_paths: list[str]) -> OcrResult:
    texts: list[str] = []
    for image_path in image_paths:
        texts.append(ocr.run_tesseract(image_path, settings.TESSERACT_LANG))
    text = "\n".join(part for part in texts if part.strip())
    confidence = 55.0 if text.strip() else 0.0
    warnings = ["low_ocr_confidence"] if confidence < 60 else []
    return OcrResult(provider="tesseract", text=text, confidence=confidence, raw={"pages": len(image_paths)}, warnings=warnings)
