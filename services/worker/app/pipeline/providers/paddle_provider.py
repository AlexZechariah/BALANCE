from __future__ import annotations

from ..models import OcrResult


_PADDLE_OCR = None


def _client():
    global _PADDLE_OCR
    if _PADDLE_OCR is None:
        from paddleocr import PaddleOCR

        _PADDLE_OCR = PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            lang="en",
        )
    return _PADDLE_OCR


def run_paddleocr(image_paths: list[str]) -> OcrResult:
    client = _client()
    texts: list[str] = []
    scores: list[float] = []
    raw_pages: list[dict] = []

    for image_path in image_paths:
        result = client.predict(image_path)
        for page in result:
            json_result = getattr(page, "json", {}) or {}
            nested_result = json_result.get("res") if isinstance(json_result, dict) else None
            if not isinstance(nested_result, dict):
                nested_result = {}
            rec_texts = page.get("rec_texts") if hasattr(page, "get") else None
            rec_scores = page.get("rec_scores") if hasattr(page, "get") else None
            rec_texts = rec_texts or nested_result.get("rec_texts") or json_result.get("rec_texts") or []
            rec_scores = rec_scores or nested_result.get("rec_scores") or json_result.get("rec_scores") or []
            texts.extend(str(text) for text in rec_texts if str(text).strip())
            scores.extend(float(score) * 100 for score in rec_scores if isinstance(score, int | float))
            raw_pages.append(json_result)

    confidence = sum(scores) / len(scores) if scores else 0.0
    warnings = ["low_ocr_confidence"] if confidence < 60 else []
    return OcrResult(provider="paddleocr", text="\n".join(texts), confidence=confidence, raw={"pages": raw_pages}, warnings=warnings)
