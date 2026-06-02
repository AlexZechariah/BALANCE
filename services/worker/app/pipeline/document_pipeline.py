from __future__ import annotations

from .artifacts import write_artifact
from .confidence import score_confidence
from .file_classifier import classify_file
from .image_preprocessor import preprocess_image
from .models import OcrResult, PipelineResult
from .ocr_provider import run_ocr
from .parser import parse_fields
from .pdf_renderer import assert_pdf_page_limit, count_pdf_pages, render_pdf_pages
from .pdf_text_extractor import extract_pdf_text
from .validator import validate_fields
from .. import settings
from ..observability import record_ocr_result, start_span


def run_document_pipeline(
    *,
    document_id: str,
    extraction_job_id: str,
    file_path: str,
    content_type: str,
    provider: str,
    pipeline_version: str | None = None,
) -> PipelineResult:
    kind = classify_file(content_type, file_path)
    warnings: list[str] = []
    page_count: int | None = None

    if kind == "pdf":
        with start_span("worker.pipeline.pdf", {"balance.worker.requested_provider": provider}):
            page_count = count_pdf_pages(file_path)
            assert_pdf_page_limit(page_count)
            text = extract_pdf_text(file_path)
            if text:
                record_ocr_result("pdf_text", "success", 0)
                ocr_result = OcrResult(provider="pdf_text", text=text, confidence=80.0, raw={"source": "pypdf"}, warnings=[])
            else:
                warnings.append("pdf_text_empty")
                pages = render_pdf_pages(file_path)
                try:
                    image_paths = [preprocess_image(path) for path in pages.image_paths]
                    ocr_result = run_ocr(provider, image_paths)
                finally:
                    pages.cleanup()
    else:
        with start_span("worker.pipeline.image", {"balance.worker.requested_provider": provider}):
            ocr_result = run_ocr(provider, [preprocess_image(file_path)])

    fields = parse_fields(ocr_result.text, ocr_result.confidence)
    warning_codes = validate_fields(fields, ocr_result.confidence, warnings + ocr_result.warnings)
    confidence_summary = score_confidence(fields, warning_codes, ocr_result.confidence)
    status = "correction_required" if confidence_summary.get("requiresCorrection") else "extracted"
    normalized = {
        "provider": ocr_result.provider,
        "requestedProvider": provider,
        "pipelineVersion": pipeline_version or settings.PIPELINE_VERSION,
        "fields": [field.__dict__ for field in fields],
        "warnings": warning_codes,
        "confidence": confidence_summary,
        "rawTextLength": len(ocr_result.text),
        "pageCount": page_count,
    }
    artifact_path = write_artifact(document_id, extraction_job_id, normalized)
    return PipelineResult(
        provider=provider,
        pipeline_version=pipeline_version or settings.PIPELINE_VERSION,
        status=status,
        fields=fields,
        warnings=warning_codes,
        confidence_summary=confidence_summary,
        raw_response=ocr_result.raw,
        normalized=normalized,
        artifact_path=artifact_path,
        page_count=page_count,
    )
