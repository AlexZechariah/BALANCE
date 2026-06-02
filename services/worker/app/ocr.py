from __future__ import annotations

import os
import re
import subprocess
import tempfile
from pathlib import Path


def _env_int(name: str, fallback: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return fallback
    try:
        return int(raw)
    except ValueError:
        return fallback


def run_tesseract(image_path: str, lang: str) -> str:
    # Use tesseract CLI directly; it is available inside the worker image.
    # Tune via env so we can iterate quickly without changing code:
    # - TESSERACT_OEM: OCR Engine Mode (default 1 = LSTM)
    # - TESSERACT_PSM: Page Segmentation Mode (default 6 = single uniform block of text)
    # - preserve_interword_spaces=1 helps retain receipt columns for parsing.
    oem = _env_int("TESSERACT_OEM", 1)
    psm = _env_int("TESSERACT_PSM", 6)
    result = subprocess.run(
        [
            "tesseract",
            image_path,
            "stdout",
            "-l",
            lang,
            "--oem",
            str(oem),
            "--psm",
            str(psm),
            "-c",
            "preserve_interword_spaces=1",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "tesseract failed")
    return result.stdout


def _render_pdf_pages(file_path: str, tmpdir: str, dpi: int) -> list[Path]:
    import fitz

    matrix = fitz.Matrix(dpi / 72, dpi / 72)
    pages: list[Path] = []
    with fitz.open(file_path) as document:
        for page_index in range(document.page_count):
            page = document.load_page(page_index)
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            out_path = Path(tmpdir) / f"page-{page_index + 1:06d}.png"
            pixmap.save(out_path)
            pages.append(out_path)
    return pages


def extract_text(content_type: str, file_path: str, lang: str) -> str:
    normalized = (content_type or "").lower().strip()

    if normalized in ("image/jpeg", "image/png"):
        return run_tesseract(file_path, lang)

    if normalized == "application/pdf":
        # Convert PDF pages to PNGs then OCR each page.
        with tempfile.TemporaryDirectory(prefix="balance-pdf-") as tmpdir:
            dpi = _env_int("PDF_OCR_DPI", 300)
            pages = _render_pdf_pages(file_path, tmpdir, dpi)
            if not pages:
                raise RuntimeError("No pages extracted from PDF")

            texts: list[str] = []
            for p in pages:
                texts.append(run_tesseract(str(p), lang))
            return "\n".join(texts)

    raise RuntimeError("unsupported content type")


def parse_fields(text: str) -> dict[str, object]:
    """
    Deterministic-but-safe parsing heuristics for receipts/invoices.

    Tesseract OCR is noisy. The initial v1 parser intentionally kept logic minimal,
    but that caused obvious mis-extractions (e.g. treating a phone number or a line-item
    price as merchant/total).

    Current behavior:
    - merchantName: best header-like line from the top of the document (or None)
    - documentDate: a valid YYYY-MM-DD derived from common date formats (or None)
    - amountMinor: best "total-like" amount (prefers Net Total/Total/Subtotal lines),
      converted to minor units (2dp). Falls back to the largest amount found.
    - currency: inferred from common tokens (RM/MYR) when possible
    """

    raw_text = text or ""
    raw_upper = raw_text.upper()
    lines_all = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    lines_upper = [ln.upper() for ln in lines_all]

    def _digit_ratio(s: str) -> float:
        if not s:
            return 1.0
        digits = sum(1 for c in s if c.isdigit())
        return digits / max(1, len(s))

    def _looks_like_phone(s: str) -> bool:
        normalized = re.sub(r"[\s\-()]+", "", s)
        return bool(re.fullmatch(r"\+?\d{7,15}", normalized))

    def _is_header_noise(s_upper: str) -> bool:
        # Common non-merchant header words.
        keywords = (
            "INVOICE",
            "RECEIPT",
            "TAX",
            "TABLE",
            "ORDER",
            "CASHIER",
            "PRN",
            "DATE",
            "TIME",
            "TEL",
            "PHONE",
            "THANK",
            "SUMMARY",
        )

        # OCR often truncates header labels (e.g. "CASHIE" instead of "CASHIER").
        for k in keywords:
            if k in s_upper:
                return True
            if len(k) >= 5 and s_upper.startswith(k[:5]):
                return True

        return False

    # Merchant name: only consider the top header region to avoid picking a line item.
    merchant: str | None = None
    header_region = lines_all[:8]
    header_region_upper = lines_upper[:8]
    candidates: list[str] = []
    for ln, ln_upper in zip(header_region, header_region_upper):
        if len(ln) < 3:
            continue
        if _looks_like_phone(ln) or _digit_ratio(ln) > 0.35:
            continue
        if _is_header_noise(ln_upper):
            continue
        # Avoid single-word header labels that slip through truncation (e.g. "Cashie").
        if " " not in ln.strip() and len(ln) <= 10:
            continue
        # Must contain at least one letter.
        if not re.search(r"[A-Z]", ln_upper):
            continue
        candidates.append(ln[:200])

    if candidates:
        # Prefer the longest candidate (often the full merchant name line).
        merchant = max(candidates, key=lambda s: len(s))

    # Date: collect candidates, validate, and pick the best-scored line.
    def _valid_dmy(d: int, m: int) -> bool:
        return 1 <= d <= 31 and 1 <= m <= 12

    date_candidates: list[tuple[int, str]] = []  # (score, YYYY-MM-DD)

    # First, consider line-based date parsing for better keyword scoring.
    for ln_upper in lines_upper:
        # dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
        for match in re.finditer(r"\b(\d{2})[\/\-.](\d{2})[\/\-.](20\d{2})\b", ln_upper):
            d = int(match.group(1))
            m = int(match.group(2))
            y = int(match.group(3))
            if not _valid_dmy(d, m):
                continue
            score = 0
            if "DATE" in ln_upper:
                score += 10
            if "PRN" in ln_upper:
                score += 8
            if "INVOICE" in ln_upper:
                score += 6
            date_candidates.append((score, f"{y:04d}-{m:02d}-{d:02d}"))

    # Also support ISO dates if present.
    for match in re.finditer(r"\b(20\d{2})-(\d{2})-(\d{2})\b", raw_text):
        y = int(match.group(1))
        m = int(match.group(2))
        d = int(match.group(3))
        if not _valid_dmy(d, m):
            continue
        date_candidates.append((12, f"{y:04d}-{m:02d}-{d:02d}"))

    document_date = max(date_candidates, key=lambda x: x[0])[1] if date_candidates else None

    # Amount: prefer totals, fall back to max amount found.
    def _parse_amount_to_minor(raw: str) -> int | None:
        cleaned = raw.replace(",", "").strip()
        if not cleaned:
            return None
        try:
            # If we have decimals, treat as major units (e.g. 217.95 -> 21795).
            if "." in cleaned:
                return int(round(float(cleaned) * 100))
            # Integer totals (OCR sometimes drops the decimals): treat as major units.
            return int(cleaned) * 100
        except ValueError:
            return None

    amount_minor: int | None = None
    currency: str | None = None

    # Currency inference (Malaysia receipts commonly show "RM").
    if "MYR" in raw_upper or re.search(r"\bRM\b", raw_upper):
        currency = "MYR"

    # Line-based scoring.
    amount_candidates: list[tuple[int, int]] = []  # (score, amount_minor)
    total_keywords = ("NET TOTAL", "GRAND TOTAL", "TOTAL", "AMOUNT DUE", "BALANCE DUE")
    subtotal_keywords = ("SUBTOTAL", "SUB TOTAL")

    for ln, ln_upper in zip(lines_all, lines_upper):
        # Extract decimal amounts in the line.
        for match in re.finditer(r"\b(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})\b", ln):
            minor = _parse_amount_to_minor(match.group(1))
            if minor is None:
                continue
            score = 0
            if any(k in ln_upper for k in total_keywords):
                score += 20
            if any(k in ln_upper for k in subtotal_keywords):
                score += 12
            # Prefer larger amounts if ambiguous.
            score += min(10, minor // 10_000)  # +1 per 100.00 up to +10
            amount_candidates.append((score, minor))

        # Also allow integer totals when the line is clearly a total line.
        if any(k in ln_upper for k in total_keywords):
            int_match = re.search(r"\b(\d{2,6})\b", ln)
            if int_match:
                minor = _parse_amount_to_minor(int_match.group(1))
                if minor is not None:
                    score = 18 + min(10, minor // 10_000)
                    amount_candidates.append((score, minor))

    if amount_candidates:
        amount_minor = max(amount_candidates, key=lambda x: x[0])[1]

    # Default currency for local demo receipts if we found an amount but couldn't infer a code/token.
    # (The app currently assumes MYR in most demo flows.)
    if amount_minor is not None and currency is None:
        currency = "MYR"

    return {
        "merchantName": merchant,
        "documentDate": document_date,
        "amountMinor": amount_minor,
        "currency": currency,
        "rawTextLength": len(raw_text),
    }
