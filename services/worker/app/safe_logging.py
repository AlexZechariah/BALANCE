from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

REDACTED = "[redacted]"

_SENSITIVE_KEYS = {
    "authorization",
    "cookie",
    "cookies",
    "password",
    "secret",
    "token",
    "session",
    "rawtext",
    "raw_text",
    "ocrtext",
    "ocr_text",
    "extractedtext",
    "extracted_text",
    "storagekey",
    "storage_key",
    "storagepath",
    "storage_path",
    "bucket",
    "key",
    "path",
    "url",
    "objecturl",
    "object_url",
}


def sanitize_log_payload(value: Any) -> Any:
    if isinstance(value, Mapping):
        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            key_text = str(key)
            if _is_sensitive_key(key_text):
                sanitized[key_text] = REDACTED
            else:
                sanitized[key_text] = sanitize_log_payload(item)
        return sanitized

    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [sanitize_log_payload(item) for item in value]

    return value


def safe_exception_summary(error: BaseException) -> dict[str, str]:
    return {"type": type(error).__name__}


def _is_sensitive_key(key: str) -> bool:
    normalized = "".join(ch for ch in key.lower() if ch.isalnum() or ch == "_")
    return normalized in _SENSITIVE_KEYS
