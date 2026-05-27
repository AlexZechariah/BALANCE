from __future__ import annotations

import re
from datetime import date

from .models import ParsedField


AMOUNT_RE = re.compile(r"(?:RM|MYR|\$)?\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\d+\.\d{2})")


def parse_fields(text: str, base_confidence: float | None) -> list[ParsedField]:
    raw_text = text or ""
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    upper_lines = [line.upper() for line in lines]
    confidence = float(base_confidence or 0.0)
    fields: list[ParsedField] = []

    merchant = _merchant(lines, upper_lines)
    if merchant:
        fields.append(ParsedField("merchantName", merchant, min(confidence, 80.0), value_type="string"))

    document_date = _date(raw_text)
    if document_date:
        fields.append(ParsedField("documentDate", document_date, min(confidence, 85.0), value_type="date"))

    currency = _currency(raw_text)
    if currency:
        fields.append(ParsedField("currency", currency, min(confidence, 90.0), value_type="currency"))

    amounts = _amount_candidates(lines, upper_lines)
    for name in ["subtotal", "tax", "serviceCharge", "discount", "roundingAdjustment", "total"]:
        candidate = amounts.get(name)
        if candidate is not None:
            fields.append(ParsedField(name, _minor_to_major(candidate), min(confidence, 85.0), value_type="money"))

    total = amounts.get("total")
    if total is not None:
        fields.append(ParsedField("amountMinor", str(total), min(confidence, 85.0), value_type="minor_units"))

    return fields


def _merchant(lines: list[str], upper_lines: list[str]) -> str | None:
    noise = ("RECEIPT", "INVOICE", "TAX", "TOTAL", "DATE", "TIME", "TEL", "PHONE", "CASHIER", "ORDER")
    for line, upper in zip(lines[:8], upper_lines[:8]):
        if len(line) < 3:
            continue
        if any(token in upper for token in noise):
            continue
        if sum(ch.isdigit() for ch in line) / max(len(line), 1) > 0.35:
            continue
        if re.search(r"[A-Za-z]", line):
            return line[:200]
    return None


def _date(text: str) -> str | None:
    patterns = [
        (r"\b(20\d{2})-(\d{2})-(\d{2})\b", "ymd"),
        (r"\b(\d{2})[\/\-.](\d{2})[\/\-.](20\d{2})\b", "dmy"),
    ]
    for pattern, kind in patterns:
        for match in re.finditer(pattern, text):
            try:
                if kind == "ymd":
                    y, m, d = int(match.group(1)), int(match.group(2)), int(match.group(3))
                else:
                    d, m, y = int(match.group(1)), int(match.group(2)), int(match.group(3))
                return date(y, m, d).isoformat()
            except ValueError:
                continue
    return None


def _currency(text: str) -> str | None:
    upper = text.upper()
    if "MYR" in upper or re.search(r"\bRM\b", upper):
        return "MYR"
    if re.search(r"\bUSD\b|\$", upper):
        return "USD"
    return None


def _amount_candidates(lines: list[str], upper_lines: list[str]) -> dict[str, int]:
    labels = {
        "subtotal": ("SUBTOTAL", "SUB TOTAL"),
        "tax": ("SST", "TAX", "GST"),
        "serviceCharge": ("SERVICE", "SVC"),
        "discount": ("DISCOUNT", "DISC"),
        "roundingAdjustment": ("ROUNDING", "ROUNDED"),
        "total": ("GRAND TOTAL", "NET TOTAL", "TOTAL", "AMOUNT DUE", "BALANCE DUE"),
    }
    out: dict[str, int] = {}
    for line, upper in zip(lines, upper_lines):
        matches = list(AMOUNT_RE.finditer(line))
        if not matches:
            continue
        amount = _to_minor(matches[-1].group(1))
        if amount is None:
            continue
        for field, tokens in labels.items():
            if any(token in upper for token in tokens):
                out[field] = amount
                break

    if "total" not in out:
        all_amounts = [_to_minor(match.group(1)) for line in lines for match in AMOUNT_RE.finditer(line)]
        valid = [amount for amount in all_amounts if amount is not None]
        if valid:
            out["total"] = max(valid)
    return out


def _to_minor(raw: str) -> int | None:
    try:
        return int(round(float(raw.replace(",", "")) * 100))
    except ValueError:
        return None


def _minor_to_major(minor: int) -> str:
    return f"{minor / 100:.2f}"
