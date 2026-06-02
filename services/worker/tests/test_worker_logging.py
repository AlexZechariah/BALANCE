import contextlib
import io
import json
import unittest

from app.queue_proof import process_queue_proof


class WorkerLoggingTests(unittest.IsolatedAsyncioTestCase):
    async def test_queue_proof_log_redacts_sensitive_payload(self):
        class Queue:
            name = "queue"

        class Job:
            id = "job-1"
            name = "proof"
            queue = Queue()
            data = {
                "normal": "ok",
                "rawText": "SECRET OCR TEXT SHOULD NOT BE LOGGED",
                "headers": {"authorization": "Bearer secret-token"},
                "objectRef": {"key": "documents/private/receipt.pdf"},
            }

        output = io.StringIO()

        with contextlib.redirect_stdout(output):
            result = await process_queue_proof(Job(), None)

        logged = output.getvalue()
        payload = json.loads(logged)

        self.assertEqual(result["processedBy"], "python-worker")
        self.assertNotIn("jobId", payload)
        self.assertNotIn("jobName", payload)
        self.assertEqual(payload["data"]["normal"], "ok")
        self.assertEqual(payload["data"]["rawText"], "[redacted]")
        self.assertEqual(payload["data"]["headers"]["authorization"], "[redacted]")
        self.assertEqual(payload["data"]["objectRef"]["key"], "[redacted]")
        self.assertNotIn("SECRET OCR TEXT SHOULD NOT BE LOGGED", logged)
        self.assertNotIn("Bearer secret-token", logged)
        self.assertNotIn("documents/private/receipt.pdf", logged)
        self.assertNotIn("job-1", logged)


if __name__ == "__main__":
    unittest.main()
