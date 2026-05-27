from __future__ import annotations

from pathlib import Path


def classify_file(content_type: str, file_path: str) -> str:
    normalized = (content_type or "").lower().strip()
    suffix = Path(file_path).suffix.lower()
    if normalized == "application/pdf" or suffix == ".pdf":
        return "pdf"
    if normalized in {"image/jpeg", "image/png"} or suffix in {".jpg", ".jpeg", ".png"}:
        return "image"
    raise RuntimeError(f"unsupported content type: {content_type}")
