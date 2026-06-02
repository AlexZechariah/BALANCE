import unittest

from app import observability


class WorkerObservabilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_queue_metrics_do_not_include_job_id_or_error_message(self):
        class Job:
            id = "job-secret-123"
            name = "proof"
            timestamp = None
            data = {"storageKey": "documents/private/receipt.pdf"}

        async def failing_handler(_job, _token):
            raise RuntimeError("document object not found: documents/private/receipt.pdf")

        wrapped = observability.instrument_queue_handler("document_extract", failing_handler, "process_extraction")

        with self.assertRaises(RuntimeError):
            await wrapped(Job(), None)

        metrics = observability.metrics_text()
        self.assertIn("balance_worker_queue_jobs_total", metrics)
        self.assertIn('queue="document_extract"', metrics)
        self.assertIn('handler="process_extraction"', metrics)
        self.assertIn('reason="runtimeerror"', metrics)
        self.assertNotIn("job-secret-123", metrics)
        self.assertNotIn("documents/private/receipt.pdf", metrics)
        self.assertNotIn("storageKey", metrics)

    def test_failure_reason_uses_exception_type_only(self):
        reason = observability.failure_reason(RuntimeError("token abc123 document id leaked"))

        self.assertEqual(reason, "runtimeerror")

    def test_storage_and_ocr_metrics_are_low_cardinality(self):
        secret_path = "C:/Users/Alex/private-receipts/receipt.pdf"
        observability.record_storage_operation("read", "filesystem", "success", 0.001)
        observability.record_storage_operation("read", "s3-compatible-secret-bucket", "failure", 0.001, RuntimeError(secret_path))
        observability.record_ocr_result("paddleocr", "success", 0.001)
        observability.record_ocr_fallback("paddleocr", "tesseract", RuntimeError("C:/secret/path.png"))

        metrics = observability.metrics_text()
        self.assertIn("balance_worker_storage_operations_total", metrics)
        self.assertIn("balance_worker_ocr_jobs_total", metrics)
        self.assertIn("balance_worker_ocr_fallbacks_total", metrics)
        self.assertIn('provider="other"', metrics)
        self.assertNotIn(secret_path, metrics)
        self.assertNotIn("s3-compatible-secret-bucket", metrics)


if __name__ == "__main__":
    unittest.main()
