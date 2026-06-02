from __future__ import annotations

import json
from pathlib import Path
import time
from typing import Any

from .. import settings
from ..observability import record_storage_operation, start_span


def write_artifact(document_id: str, extraction_job_id: str, payload: dict[str, Any]) -> str:
    start = time.perf_counter()
    try:
        with start_span("worker.storage.write", {"balance.worker.storage_provider": "filesystem"}):
            root = Path(settings.OBJECT_STORAGE_ARTIFACT_ROOT)
            target_dir = root / document_id
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / f"{extraction_job_id}.json"
            target.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
            record_storage_operation("write", "filesystem", "success", time.perf_counter() - start)
            return str(target)
    except Exception as exc:
        record_storage_operation("write", "filesystem", "failure", time.perf_counter() - start, exc)
        raise
