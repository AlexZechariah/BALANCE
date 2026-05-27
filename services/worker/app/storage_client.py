from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from . import settings


@dataclass(frozen=True)
class LocalObject:
    path: str
    key: str
    provider: str


def fetch_job_object(job_data: dict) -> LocalObject:
    object_ref = job_data.get("objectRef") or {}
    provider = str(object_ref.get("provider") or job_data.get("storageDriver") or settings.OBJECT_STORAGE_PROVIDER or "filesystem")
    provider = provider.strip()
    key = str(object_ref.get("key") or job_data.get("storageKey") or "").strip()
    if not key:
        raise RuntimeError("missing object storage key")

    if provider in {"filesystem", "legacy_filesystem"}:
        return LocalObject(path=str(_resolve_local_key(key)), key=key.replace("\\", "/").lstrip("/"), provider="filesystem")

    raise RuntimeError(f"Object storage provider '{provider}' is not active in the v0.5 local worker")


def _resolve_local_key(key: str) -> Path:
    normalized = key.replace("\\", "/").lstrip("/")
    parts = normalized.split("/")
    if not normalized or any(part in {"", ".", ".."} for part in parts):
        raise RuntimeError("invalid object storage key")

    root = Path(settings.STORAGE_FILESYSTEM_ROOT).resolve()
    target = root.joinpath(*parts).resolve()
    if target != root and root not in target.parents:
        raise RuntimeError("invalid object storage key")
    if not target.exists():
        raise RuntimeError("document object not found")
    return target
