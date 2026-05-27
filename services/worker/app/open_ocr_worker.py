from __future__ import annotations

from . import settings
from .db_persistence import mark_failed, mark_started, persist_pipeline_result
from .pipeline.document_pipeline import run_document_pipeline
from .storage_client import fetch_job_object


async def process_extraction(job, _job_token):
    data = job.data or {}
    extraction_job_id = data.get("extractionJobId")
    document_id = data.get("documentId")
    content_type = data.get("contentType")
    provider = _provider(data.get("provider"))
    pipeline_version = str(data.get("pipelineVersion") or settings.PIPELINE_VERSION)
    object_ref = data.get("objectRef") if isinstance(data.get("objectRef"), dict) else None

    if not extraction_job_id or not document_id or not content_type:
        raise RuntimeError("missing job payload fields")

    try:
        local_object = fetch_job_object(data)
        mark_started(document_id, extraction_job_id, provider, pipeline_version, object_ref)
        result = run_document_pipeline(
            document_id=document_id,
            extraction_job_id=extraction_job_id,
            file_path=local_object.path,
            content_type=content_type,
            provider=provider,
            pipeline_version=pipeline_version,
        )
        persist_pipeline_result(document_id, extraction_job_id, result)
        return {
            "status": result.status,
            "provider": result.provider,
            "warnings": result.warnings,
            "confidence": result.confidence_summary,
        }
    except Exception as exc:
        mark_failed(document_id, extraction_job_id, provider, exc)
        raise


def _provider(value: object) -> str:
    provider = str(value or settings.EXTRACTION_PROVIDER_DEFAULT or settings.OCR_PROVIDER or "paddleocr").strip().lower()
    if provider == "textract":
        return "legacy_textract"
    return provider
