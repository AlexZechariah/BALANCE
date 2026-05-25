import asyncio
import signal

from fastapi import FastAPI
from bullmq import Worker
from redis.asyncio import Redis

from .queue_proof import process_queue_proof
from .extraction_worker import process_extraction
from . import settings
from . import db

import logging

logging.basicConfig(
    level=logging.ERROR,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

VERSION = "0.4.1"

app = FastAPI(title="Balance Worker", version=VERSION)

_shutdown = asyncio.Event()
_workers: list[Worker] = []


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


@app.on_event("startup")
async def on_startup():
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
        w = Worker(queue_name, handler, {"connection": settings.REDIS_URL})
        w.on("failed", lambda job, err: logger.error(
            "Worker job %s failed (queue=%s): %s", job.id, queue_name, err
        ))
        _workers.append(w)

    async def _waiter():
        await _shutdown.wait()
        for w in _workers:
            await w.close()

    asyncio.create_task(_waiter())
