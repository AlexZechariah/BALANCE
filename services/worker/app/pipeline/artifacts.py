from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .. import settings


def write_artifact(document_id: str, extraction_job_id: str, payload: dict[str, Any]) -> str:
    root = Path(settings.OBJECT_STORAGE_ARTIFACT_ROOT)
    target_dir = root / document_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{extraction_job_id}.json"
    target.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return str(target)
