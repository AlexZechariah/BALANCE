from __future__ import annotations

from datetime import date

from .models import ParsedField


def validate_fields(fields: list[ParsedField], ocr_confidence: float | None, text_warnings: list[str]) -> list[str]:
    warnings = list(dict.fromkeys(text_warnings))
    by_name = {field.name: field for field in fields}

    if "total" not in by_name and "amountMinor" not in by_name:
        warnings.append("missing_total")
    if "currency" not in by_name:
        warnings.append("currency_missing")
    if "merchantName" not in by_name:
        warnings.append("merchant_uncertain")
    if ocr_confidence is None or ocr_confidence < 60:
        warnings.append("low_ocr_confidence")

    doc_date = by_name.get("documentDate")
    if doc_date:
        try:
            parsed = date.fromisoformat(doc_date.value)
            if parsed > date.today():
                warnings.append("future_date_suspected")
        except ValueError:
            warnings.append("date_parse_failed")

    if not _amounts_balance(by_name):
        warnings.append("amount_arithmetic_mismatch")

    return list(dict.fromkeys(warnings))


def _money(field: ParsedField | None) -> int:
    if not field:
        return 0
    try:
        return int(round(float(field.value) * 100))
    except ValueError:
        return 0


def _amounts_balance(by_name: dict[str, ParsedField]) -> bool:
    total = _money(by_name.get("total"))
    subtotal = _money(by_name.get("subtotal"))
    if total == 0 or subtotal == 0:
        return True
    tax = _money(by_name.get("tax"))
    service = _money(by_name.get("serviceCharge"))
    discount = _money(by_name.get("discount"))
    rounding = _money(by_name.get("roundingAdjustment"))
    expected = subtotal + tax + service - discount + rounding
    return abs(expected - total) <= 2
