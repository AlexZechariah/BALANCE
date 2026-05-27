from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone

from . import db, settings
from .pipeline.models import ParsedField, PipelineResult


def persist_pipeline_result(document_id: str, extraction_job_id: str, result: PipelineResult) -> None:
    with db.connect(settings.DATABASE_URL) as conn:
        with conn.cursor() as cur:
            for field in result.fields:
                _upsert_field(cur, document_id, field)

            by_name = {field.name: field.value for field in result.fields}
            merchant_name = by_name.get("merchantName")
            document_date = by_name.get("documentDate")
            amount_minor = _amount_minor(by_name)
            currency = by_name.get("currency")
            fingerprint = _fingerprint(merchant_name, document_date, amount_minor, currency)
            quality_score = int(result.confidence_summary.get("document") or 0)

            cur.execute(
                'UPDATE "Document" SET status=%s::"DocumentStatus", "merchantName"=%s, "documentDate"=%s, "amountMinor"=%s, currency=%s, "qualityScore"=%s, "qualityWarnings"=%s::jsonb, "duplicateFingerprint"=%s, "transactionDate"=%s, "extractionSummary"=%s::jsonb, "pageCount"=%s, "updatedAt"=%s WHERE id=%s',
                (
                    result.status,
                    merchant_name,
                    document_date,
                    amount_minor,
                    currency,
                    quality_score,
                    json.dumps(result.warnings),
                    fingerprint,
                    document_date,
                    json.dumps(result.normalized),
                    result.page_count,
                    _now(),
                    document_id,
                ),
            )
            cur.execute(
                'INSERT INTO "ExtractionArtifact" (id, "extractionJobId", provider, "artifactType", stage, payload, "rawResponse", normalized, warnings, "createdAt") '
                'VALUES (%s::uuid, %s, %s::"ExtractionProvider", %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s) '
                'ON CONFLICT ("extractionJobId") DO UPDATE SET provider=EXCLUDED.provider, "artifactType"=EXCLUDED."artifactType", stage=EXCLUDED.stage, payload=EXCLUDED.payload, "rawResponse"=EXCLUDED."rawResponse", normalized=EXCLUDED.normalized, warnings=EXCLUDED.warnings',
                (
                    _uuid(),
                    extraction_job_id,
                    result.provider,
                    "pipeline_json",
                    "completed",
                    json.dumps({"artifactPath": result.artifact_path}),
                    json.dumps(result.raw_response),
                    json.dumps(result.normalized),
                    json.dumps(result.warnings),
                    _now(),
                ),
            )
            cur.execute(
                'UPDATE "ExtractionJob" SET status=%s::"ExtractionJobStatus", "completedAt"=%s, "errorMessage"=NULL, "warningCodes"=%s::jsonb, "confidenceSummary"=%s::jsonb WHERE id=%s',
                ("completed", _now(), json.dumps(result.warnings), json.dumps(result.confidence_summary), extraction_job_id),
            )
            _audit(cur, "extraction.completed", "extraction_job", extraction_job_id, "Extraction completed", result.normalized, document_id, extraction_job_id)
            for warning in result.warnings:
                _audit(cur, "extraction.warning", "document", document_id, warning, {"provider": result.provider, "warning": warning}, document_id, extraction_job_id)


def mark_started(document_id: str, extraction_job_id: str, provider: str, pipeline_version: str, object_ref: dict | None) -> None:
    with db.connect(settings.DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE "ExtractionJob" SET status=%s::"ExtractionJobStatus", "startedAt"=%s, "pipelineVersion"=%s WHERE id=%s',
                ("processing", _now(), pipeline_version, extraction_job_id),
            )
            cur.execute(
                'UPDATE "Document" SET status=%s::"DocumentStatus", "storageProvider"=%s, "storageBucket"=%s, "storageEtag"=%s, "storageSha256"=%s, "storageSizeBytes"=%s, "storageContentType"=%s, "updatedAt"=%s WHERE id=%s',
                (
                    "processing",
                    (object_ref or {}).get("provider"),
                    (object_ref or {}).get("bucket"),
                    (object_ref or {}).get("etag"),
                    (object_ref or {}).get("sha256"),
                    (object_ref or {}).get("sizeBytes"),
                    (object_ref or {}).get("contentType"),
                    _now(),
                    document_id,
                ),
            )
            _audit(cur, "extraction.started", "document", document_id, "Extraction started", {"provider": provider, "objectRef": object_ref or {}}, document_id, extraction_job_id)


def mark_failed(document_id: str, extraction_job_id: str, provider: str, error: Exception) -> None:
    with db.connect(settings.DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE "ExtractionJob" SET status=%s::"ExtractionJobStatus", "completedAt"=%s, "errorMessage"=%s WHERE id=%s',
                ("failed", _now(), str(error)[:500], extraction_job_id),
            )
            cur.execute(
                'UPDATE "Document" SET status=%s::"DocumentStatus", "updatedAt"=%s WHERE id=%s',
                ("failed", _now(), document_id),
            )
            _audit(cur, "extraction.failed", "document", document_id, "Extraction failed", {"provider": provider, "error": str(error)[:500]}, document_id, extraction_job_id)


def _upsert_field(cur, document_id: str, field: ParsedField) -> None:
    cur.execute(
        'INSERT INTO "DocumentField" (id, "documentId", name, value, "correctedValue", confidence, source, "groupKey", "rawType", "rawLabel", "normalizedValue", "valueType", "pageNumber", geometry, "validationStatus", "reviewState", metadata, "createdAt", "updatedAt") '
        'VALUES (%s::uuid, %s, %s::"FieldName", %s, NULL, %s, %s::"FieldSource", %s, NULL, %s, %s, %s, NULL, NULL, %s, %s, %s::jsonb, %s, %s) '
        'ON CONFLICT ("documentId", name, "groupKey") DO UPDATE SET value=EXCLUDED.value, confidence=EXCLUDED.confidence, source=EXCLUDED.source, "rawLabel"=EXCLUDED."rawLabel", "normalizedValue"=EXCLUDED."normalizedValue", "valueType"=EXCLUDED."valueType", "validationStatus"=EXCLUDED."validationStatus", "reviewState"=EXCLUDED."reviewState", metadata=EXCLUDED.metadata, "updatedAt"=EXCLUDED."updatedAt"',
        (
            _uuid(),
            document_id,
            field.name,
            str(field.value),
            field.confidence,
            "ocr",
            "summary",
            field.raw_label,
            field.normalized_value,
            field.value_type,
            "needs_review" if field.confidence < 70 else "valid",
            "pending" if field.confidence < 70 else "accepted",
            json.dumps(field.metadata or {}),
            _now(),
            _now(),
        ),
    )


def _amount_minor(by_name: dict[str, str]) -> int | None:
    if by_name.get("amountMinor"):
        try:
            return int(by_name["amountMinor"])
        except ValueError:
            return None
    if by_name.get("total"):
        try:
            return int(round(float(by_name["total"]) * 100))
        except ValueError:
            return None
    return None


def _fingerprint(merchant: str | None, doc_date: str | None, amount_minor: int | None, currency: str | None) -> str | None:
    if not any([merchant, doc_date, amount_minor, currency]):
        return None
    raw = "|".join([(merchant or "").lower().strip(), doc_date or "", str(amount_minor or ""), (currency or "").upper()])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _audit(cur, action: str, entity_type: str, entity_id: str, message: str, metadata: dict, document_id: str, extraction_job_id: str) -> None:
    cur.execute(
        'INSERT INTO "AuditEvent" (id, action, "entityType", "entityId", "actorId", "actorRole", message, metadata, "createdAt", "documentId", "extractionJobId") '
        'VALUES (%s::uuid, %s, %s::"EntityType", %s, %s, %s, %s, %s::jsonb, %s, %s, %s)',
        (_uuid(), action, entity_type, entity_id, None, "system", message, json.dumps(metadata), _now(), document_id, extraction_job_id),
    )


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)
