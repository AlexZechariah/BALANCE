from __future__ import annotations

import logging
import re
import sys
import time
from contextlib import nullcontext
from typing import Any, Awaitable, Callable

from fastapi import Request, Response
from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, generate_latest
from prometheus_client.exposition import CONTENT_TYPE_LATEST

from . import settings
from .safe_logging import safe_exception_summary


logger = logging.getLogger(__name__)

REGISTRY = CollectorRegistry(auto_describe=True)

HTTP_REQUESTS = Counter(
    "http_requests",
    "Worker HTTP requests by method, route template, and status class.",
    ["method", "route", "status_class"],
    namespace="balance_worker",
    registry=REGISTRY,
)
HTTP_DURATION = Histogram(
    "http_request_duration_seconds",
    "Worker HTTP request duration by method, route template, and status class.",
    ["method", "route", "status_class"],
    namespace="balance_worker",
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
    registry=REGISTRY,
)
PROCESS_HEALTH = Gauge(
    "process_health",
    "Worker process health where 1 means accepting work and 0 means shutting down.",
    namespace="balance_worker",
    registry=REGISTRY,
)
QUEUE_JOBS = Counter(
    "queue_jobs",
    "Worker queue jobs by queue, handler, result, and safe reason class.",
    ["queue", "handler", "result", "reason"],
    namespace="balance_worker",
    registry=REGISTRY,
)
QUEUE_JOB_DURATION = Histogram(
    "queue_job_duration_seconds",
    "Worker queue job processing duration by queue, handler, and result.",
    ["queue", "handler", "result"],
    namespace="balance_worker",
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300),
    registry=REGISTRY,
)
QUEUE_WAIT = Histogram(
    "queue_wait_seconds",
    "Approximate time between queue job creation and processing start.",
    ["queue"],
    namespace="balance_worker",
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300),
    registry=REGISTRY,
)
OCR_JOBS = Counter(
    "ocr_jobs",
    "OCR provider attempts by provider, result, and safe reason class.",
    ["provider", "result", "reason"],
    namespace="balance_worker",
    registry=REGISTRY,
)
OCR_DURATION = Histogram(
    "ocr_duration_seconds",
    "OCR provider attempt duration by provider and result.",
    ["provider", "result"],
    namespace="balance_worker",
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300),
    registry=REGISTRY,
)
OCR_FALLBACKS = Counter(
    "ocr_fallbacks",
    "OCR fallback attempts by source provider, target provider, and safe reason class.",
    ["from_provider", "to_provider", "reason"],
    namespace="balance_worker",
    registry=REGISTRY,
)
PDF_RENDER_DURATION = Histogram(
    "pdf_render_duration_seconds",
    "PDF render duration by result and safe reason class.",
    ["result", "reason"],
    namespace="balance_worker",
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120),
    registry=REGISTRY,
)
PDF_PAGE_COUNT = Histogram(
    "pdf_page_count",
    "Rendered PDF page count.",
    namespace="balance_worker",
    buckets=(1, 2, 3, 5, 10, 20, 50),
    registry=REGISTRY,
)
STORAGE_OPS = Counter(
    "storage_operations",
    "Worker storage operations by operation, provider, result, and safe reason class.",
    ["operation", "provider", "result", "reason"],
    namespace="balance_worker",
    registry=REGISTRY,
)
STORAGE_DURATION = Histogram(
    "storage_operation_duration_seconds",
    "Worker storage operation duration by operation, provider, and result.",
    ["operation", "provider", "result"],
    namespace="balance_worker",
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
    registry=REGISTRY,
)

_SAFE_PROVIDERS = {"filesystem", "paddleocr", "tesseract", "pdf_text", "manual", "legacy_textract"}
_SAFE_QUEUES = {"document_extract", "queue_proof"}
_OTEL_STARTED = False
_TRACER_PROVIDER: Any = None
_LOGGER_PROVIDER: Any = None


async def observe_fastapi_request(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    start = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        if request.url.path != "/metrics":
            route = _route_template(request)
            status_class = _status_class(status_code)
            method = request.method.upper()
            duration = time.perf_counter() - start
            HTTP_REQUESTS.labels(method=method, route=route, status_class=status_class).inc()
            HTTP_DURATION.labels(method=method, route=route, status_class=status_class).observe(duration)


def metrics_response() -> Response:
    return Response(content=generate_latest(REGISTRY), media_type=CONTENT_TYPE_LATEST)


def metrics_text() -> str:
    return generate_latest(REGISTRY).decode("utf-8", errors="replace")


def set_worker_health(is_healthy: bool) -> None:
    PROCESS_HEALTH.set(1 if is_healthy else 0)


def instrument_queue_handler(
    queue_name: str,
    handler: Callable[[Any, Any], Awaitable[Any]],
    handler_name: str,
) -> Callable[[Any, Any], Awaitable[Any]]:
    safe_queue = normalize_queue(queue_name)
    safe_handler = _safe_label(handler_name or "handler")

    async def wrapped(job: Any, job_token: Any) -> Any:
        _observe_queue_wait(safe_queue, job)
        start = time.perf_counter()
        try:
            result = await handler(job, job_token)
            duration = time.perf_counter() - start
            QUEUE_JOBS.labels(queue=safe_queue, handler=safe_handler, result="success", reason="none").inc()
            QUEUE_JOB_DURATION.labels(queue=safe_queue, handler=safe_handler, result="success").observe(duration)
            return result
        except Exception as exc:
            duration = time.perf_counter() - start
            reason = failure_reason(exc)
            QUEUE_JOBS.labels(queue=safe_queue, handler=safe_handler, result="failure", reason=reason).inc()
            QUEUE_JOB_DURATION.labels(queue=safe_queue, handler=safe_handler, result="failure").observe(duration)
            raise

    return wrapped


def log_worker_failure(queue_name: str, error: BaseException) -> None:
    logger.error(
        "Worker job failed (queue=%s, error_type=%s)",
        normalize_queue(queue_name),
        safe_exception_summary(error)["type"],
    )


def record_ocr_result(provider: str, result: str, duration_seconds: float, error: BaseException | None = None) -> None:
    provider_label = normalize_provider(provider)
    result_label = "success" if result == "success" else "failure"
    reason = "none" if error is None else failure_reason(error)
    OCR_JOBS.labels(provider=provider_label, result=result_label, reason=reason).inc()
    OCR_DURATION.labels(provider=provider_label, result=result_label).observe(max(duration_seconds, 0))


def record_ocr_fallback(from_provider: str, to_provider: str, error: BaseException) -> None:
    OCR_FALLBACKS.labels(
        from_provider=normalize_provider(from_provider),
        to_provider=normalize_provider(to_provider),
        reason=failure_reason(error),
    ).inc()


def record_pdf_render(result: str, duration_seconds: float, page_count: int | None = None, error: BaseException | None = None) -> None:
    result_label = "success" if result == "success" else "failure"
    reason = "none" if error is None else failure_reason(error)
    PDF_RENDER_DURATION.labels(result=result_label, reason=reason).observe(max(duration_seconds, 0))
    if page_count is not None:
        PDF_PAGE_COUNT.observe(max(page_count, 0))


def record_storage_operation(
    operation: str,
    provider: str,
    result: str,
    duration_seconds: float,
    error: BaseException | None = None,
) -> None:
    result_label = "success" if result == "success" else "failure"
    operation_label = _safe_label(operation)
    STORAGE_OPS.labels(
        operation=operation_label,
        provider=normalize_provider(provider),
        result=result_label,
        reason="none" if error is None else failure_reason(error),
    ).inc()
    STORAGE_DURATION.labels(
        operation=operation_label,
        provider=normalize_provider(provider),
        result=result_label,
    ).observe(max(duration_seconds, 0))


def start_span(name: str, attributes: dict[str, Any] | None = None):
    try:
        from opentelemetry import trace
    except ImportError:
        return nullcontext()

    safe_attributes = {
        key: value
        for key, value in (attributes or {}).items()
        if isinstance(value, str | int | float | bool) and _safe_attribute_name(key)
    }
    return trace.get_tracer("balance.worker").start_as_current_span(name, attributes=safe_attributes)


def start_observability(app: Any) -> None:
    global _OTEL_STARTED, _TRACER_PROVIDER, _LOGGER_PROVIDER
    if _OTEL_STARTED:
        return
    _OTEL_STARTED = True

    if settings.WORKER_OTEL_ENABLED:
        try:
            from opentelemetry import trace
            from opentelemetry._logs import set_logger_provider
            from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
            from opentelemetry.instrumentation.logging import LoggingInstrumentor
            from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
            from opentelemetry.instrumentation.redis import RedisInstrumentor
            from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
            from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
            from opentelemetry.sdk.resources import Resource
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor

            resource = Resource.create(
                {
                    "service.name": settings.WORKER_OTEL_SERVICE_NAME,
                    "deployment.environment": settings.APP_ENV,
                }
            )

            _TRACER_PROVIDER = TracerProvider(resource=resource)
            _TRACER_PROVIDER.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.OTEL_TRACES_ENDPOINT)))
            trace.set_tracer_provider(_TRACER_PROVIDER)

            _LOGGER_PROVIDER = LoggerProvider(resource=resource)
            _LOGGER_PROVIDER.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter(endpoint=settings.OTEL_LOGS_ENDPOINT)))
            set_logger_provider(_LOGGER_PROVIDER)
            logging.getLogger().addHandler(LoggingHandler(level=logging.INFO, logger_provider=_LOGGER_PROVIDER))

            LoggingInstrumentor().instrument(set_logging_format=False)
            RedisInstrumentor().instrument()
            PsycopgInstrumentor().instrument()
            FastAPIInstrumentor.instrument_app(app, excluded_urls="/metrics")
        except Exception as exc:
            logger.warning("Worker OpenTelemetry startup skipped (error_type=%s)", safe_exception_summary(exc)["type"])

    _start_pyroscope()


def shutdown_observability() -> None:
    for provider in (_TRACER_PROVIDER, _LOGGER_PROVIDER):
        shutdown = getattr(provider, "shutdown", None)
        if callable(shutdown):
            try:
                shutdown()
            except Exception as exc:
                logger.warning("Worker observability shutdown skipped (error_type=%s)", safe_exception_summary(exc)["type"])


def failure_reason(error: BaseException) -> str:
    return _safe_label(type(error).__name__)


def normalize_provider(value: object) -> str:
    label = _safe_label(str(value or "unknown"))
    return label if label in _SAFE_PROVIDERS else "other"


def normalize_queue(value: object) -> str:
    label = _safe_label(str(value or "unknown"))
    return label if label in _SAFE_QUEUES else "other"


def _start_pyroscope() -> None:
    if not settings.WORKER_PROFILING_ENABLED:
        return
    if sys.platform.startswith("win"):
        logger.warning("Worker Pyroscope profiling skipped on Windows host")
        return

    try:
        import pyroscope

        pyroscope.configure(
            application_name=settings.WORKER_OTEL_SERVICE_NAME,
            server_address=settings.PYROSCOPE_SERVER_ADDRESS,
            sample_rate=100,
            oncpu=True,
            gil_only=True,
            enable_logging=False,
            tags={
                "service": "balance-worker",
                "env": settings.APP_ENV,
            },
        )
    except Exception as exc:
        logger.warning("Worker Pyroscope startup skipped (error_type=%s)", safe_exception_summary(exc)["type"])


def _observe_queue_wait(queue: str, job: Any) -> None:
    raw_timestamp = getattr(job, "timestamp", None)
    if raw_timestamp is None and isinstance(getattr(job, "data", None), dict):
        raw_timestamp = job.data.get("timestamp")
    try:
        timestamp_ms = float(raw_timestamp)
    except (TypeError, ValueError):
        return
    wait_seconds = time.time() - (timestamp_ms / 1000)
    if 0 <= wait_seconds <= 86400:
        QUEUE_WAIT.labels(queue=queue).observe(wait_seconds)


def _route_template(request: Request) -> str:
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    if isinstance(path, str) and path:
        return path
    if request.url.path in {"/health", "/ready", "/metrics"}:
        return request.url.path
    return "unmatched"


def _status_class(status_code: int) -> str:
    return f"{int(status_code / 100)}xx"


def _safe_label(value: str) -> str:
    label = re.sub(r"[^a-zA-Z0-9_]+", "_", value.strip().lower()).strip("_")
    return label[:64] or "unknown"


def _safe_attribute_name(name: str) -> bool:
    forbidden = {
        "document_id",
        "extraction_job_id",
        "claim_id",
        "review_id",
        "user_id",
        "session_id",
        "token",
        "storage_key",
        "storage_path",
        "object_path",
        "file_path",
        "raw_text",
    }
    normalized = _safe_label(name)
    return normalized not in forbidden
