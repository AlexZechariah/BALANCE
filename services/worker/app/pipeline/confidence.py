from __future__ import annotations

from .models import ParsedField


def score_confidence(fields: list[ParsedField], warnings: list[str], ocr_confidence: float | None) -> dict[str, object]:
    field_scores = {field.name: round(field.confidence, 2) for field in fields}
    critical = ["merchantName", "documentDate", "total"]
    present = sum(1 for name in critical if name in field_scores)
    base = float(ocr_confidence or 0.0)
    if fields:
        base = (base + sum(field.confidence for field in fields) / len(fields)) / 2
    base += present * 5
    base -= len(warnings) * 6
    document = max(0, min(100, round(base, 2)))
    return {
        "document": document,
        "fields": field_scores,
        "requiresCorrection": document < 70 or any(code in warnings for code in ["missing_total", "amount_arithmetic_mismatch"]),
    }
