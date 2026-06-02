import asyncio
import signal

from fastapi import FastAPI
from bullmq import Worker
from redis.asyncio import Redis

from .queue_proof import process_queue_proof
from .open_ocr_worker import process_extraction
from .observability import (
    instrument_queue_handler,
    log_worker_failure,
    metrics_response,
    observe_fastapi_request,
    set_worker_health,
    shutdown_observability,
    start_observability,
)
from . import settings
from . import db

import logging

logging.basicConfig(
    level=logging.ERROR,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

VERSION = "0.6.0"

app = FastAPI(title="Balance Worker", version=VERSION)

_shutdown = asyncio.Event()
_workers: list[Worker] = []


@app.middleware("http")
async def metrics_middleware(request, call_next):
    return await observe_fastapi_request(request, call_next)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "balance-worker"}


@app.get("/ready")
async def ready():
    redis = Redis.from_url(settings.REDIS_URL)
    try:
        await redis.ping()
        with db.connect(settings.DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
    finally:
        await redis.aclose()

    return {"status": "ready", "service": "balance-worker"}


@app.get("/metrics", include_in_schema=False)
async def metrics():
    return metrics_response()


@app.on_event("startup")
async def on_startup():
    start_observability(app)
    set_worker_health(True)

    def _signal_handler(_signum, _frame):
        _shutdown.set()

    # Uvicorn (or a parent supervisor) can run the app in a non-main thread in some
    # configurations. Registering signal handlers outside the main thread raises:
    # "ValueError: signal only works in main thread".
    #
    # We treat signals as best-effort here: the process supervisor will still stop
    # the container, and the worker queue consumers will be closed when the event
    # loop stops.
    try:
        signal.signal(signal.SIGTERM, _signal_handler)
        signal.signal(signal.SIGINT, _signal_handler)
    except ValueError:
        pass

    for queue_name, handler in [
        (settings.QUEUE_PROOF_NAME, process_queue_proof),
        (settings.EXTRACTION_QUEUE_NAME, process_extraction),
    ]:
        wrapped = instrument_queue_handler(queue_name, handler, getattr(handler, "__name__", "handler"))
        w = Worker(queue_name, wrapped, {"connection": settings.REDIS_URL})
        w.on("failed", lambda _job, err, queue=queue_name: log_worker_failure(queue, err))
        _workers.append(w)

    async def _waiter():
        await _shutdown.wait()
        await _close_workers()

    asyncio.create_task(_waiter())


@app.on_event("shutdown")
async def on_shutdown():
    set_worker_health(False)
    await _close_workers()
    shutdown_observability()


async def _close_workers():
    while _workers:
        worker = _workers.pop()
        await worker.close()
