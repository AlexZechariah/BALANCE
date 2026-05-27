from __future__ import annotations


def extract_pdf_text(file_path: str) -> str:
    try:
        from pypdf import PdfReader
    except Exception:
        return ""

    try:
        reader = PdfReader(file_path)
        parts: list[str] = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
        text = "\n".join(part for part in parts if part.strip())
        return text if _meaningful_text(text) else ""
    except Exception:
        return ""


def _meaningful_text(text: str) -> bool:
    stripped = "".join(ch for ch in text if not ch.isspace())
    alpha_numeric = sum(1 for ch in stripped if ch.isalnum())
    return len(stripped) >= 30 and alpha_numeric >= 20
