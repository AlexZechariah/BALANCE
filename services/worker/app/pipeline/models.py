from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class OcrResult:
    provider: str
    text: str
    confidence: float | None
    raw: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


@dataclass
class ParsedField:
    name: str
    value: str
    confidence: float
    raw_label: str | None = None
    normalized_value: str | None = None
    value_type: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class PipelineResult:
    provider: str
    pipeline_version: str
    status: str
    fields: list[ParsedField]
    warnings: list[str]
    confidence_summary: dict[str, Any]
    raw_response: dict[str, Any]
    normalized: dict[str, Any]
    artifact_path: str | None = None
    page_count: int | None = None
