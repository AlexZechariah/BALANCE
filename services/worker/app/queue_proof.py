import json

from .safe_logging import sanitize_log_payload


async def process_queue_proof(job, _job_token):
    data = sanitize_log_payload(job.data)
    payload = {
        "event": "queue_proof.received",
        "queue": getattr(getattr(job, "queue", None), "name", None),
        "data": data,
    }
    print(json.dumps(payload), flush=True)

    return {"processedBy": "python-worker", "echo": data}
