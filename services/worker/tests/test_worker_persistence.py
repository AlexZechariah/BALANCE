import unittest
from unittest.mock import patch

from app import db_persistence
from app.pipeline.models import PipelineResult
from app.pipeline.pdf_renderer import PdfPageLimitExceeded


class CursorContext:
    def __init__(self, cursor):
        self.cursor = cursor

    def __enter__(self):
        return self.cursor

    def __exit__(self, _exc_type, _exc, _tb):
        return False


class ConnectionContext:
    def __init__(self, cursor):
        self.cursor_obj = cursor

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _tb):
        return False

    def cursor(self):
        return CursorContext(self.cursor_obj)


class FakeCursor:
    def __init__(self, select_result):
        self.select_result = select_result
        self.statements = []

    def execute(self, statement, params=None):
        self.statements.append((statement, params))

    def fetchone(self):
        return self.select_result


class WorkerPersistenceTests(unittest.TestCase):
    def test_completed_extraction_audit_omits_normalized_document_data(self):
        cursor = FakeCursor(select_result=(1,))
        result = PipelineResult(
            provider="paddleocr",
            fields=[],
            normalized={"merchantName": "Private Merchant", "customerTaxId": "PRIVATE-TAX-ID"},
            raw_response={"text": "PRIVATE OCR TEXT"},
            warnings=["low_confidence"],
            confidence_summary={"document": 60},
            status="extracted",
            artifact_path="/data/private-artifact.json",
            page_count=2,
            pipeline_version="test",
        )

        with patch("app.db_persistence.db.connect", return_value=ConnectionContext(cursor)):
            db_persistence.persist_pipeline_result(
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
                result,
            )

        audit_params = [
            params for statement, params in cursor.statements if 'INSERT INTO "AuditEvent"' in statement
        ]
        completed_audit = next(params for params in audit_params if params[1] == "extraction.completed")
        serialized_audit = str(completed_audit)
        self.assertIn("paddleocr", serialized_audit)
        self.assertIn("warningCount", serialized_audit)
        self.assertIn("pageCount", serialized_audit)
        self.assertNotIn("Private Merchant", serialized_audit)
        self.assertNotIn("PRIVATE-TAX-ID", serialized_audit)
        self.assertNotIn("PRIVATE OCR TEXT", serialized_audit)
        self.assertNotIn("private-artifact", serialized_audit)

    def test_mark_started_audit_omits_object_reference_and_storage_key(self):
        cursor = FakeCursor(select_result=(1,))

        with patch("app.db_persistence.db.connect", return_value=ConnectionContext(cursor)):
            db_persistence.mark_started(
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
                "paddleocr",
                "v1",
                {"provider": "filesystem", "key": "documents/private.pdf", "storageKey": "documents/private.pdf"},
            )

        audit_params = next(
            params for statement, params in cursor.statements if 'INSERT INTO "AuditEvent"' in statement
        )
        serialized_audit = str(audit_params)
        self.assertIn("paddleocr", serialized_audit)
        self.assertNotIn("objectRef", serialized_audit)
        self.assertNotIn("storageKey", serialized_audit)
        self.assertNotIn("documents/private.pdf", serialized_audit)

    def test_mark_started_rejects_stale_queue_job_before_mutating_rows(self):
        cursor = FakeCursor(select_result=None)

        with patch("app.db_persistence.db.connect", return_value=ConnectionContext(cursor)):
            with self.assertRaises(db_persistence.StaleExtractionJobReference):
                db_persistence.mark_started(
                    "00000000-0000-0000-0000-000000000001",
                    "00000000-0000-0000-0000-000000000002",
                    "paddleocr",
                    "v1",
                    {},
                )

        statements = [statement for statement, _params in cursor.statements]
        self.assertEqual(len(statements), 1)
        self.assertTrue(statements[0].startswith('SELECT 1 FROM "ExtractionJob"'))
        self.assertFalse(any('UPDATE "Document"' in statement for statement in statements))
        self.assertFalse(any('INSERT INTO "AuditEvent"' in statement for statement in statements))

    def test_mark_failed_skips_database_audit_when_stale_queue_job_has_no_rows(self):
        cursor = FakeCursor(select_result=None)

        with patch("app.db_persistence.db.connect", return_value=ConnectionContext(cursor)):
            db_persistence.mark_failed(
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
                "paddleocr",
                RuntimeError("private path must not force a foreign key write"),
            )

        statements = [statement for statement, _params in cursor.statements]
        self.assertEqual(len(statements), 1)
        self.assertTrue(statements[0].startswith('SELECT 1 FROM "ExtractionJob"'))
        self.assertFalse(any('UPDATE "ExtractionJob"' in statement for statement in statements))
        self.assertFalse(any('INSERT INTO "AuditEvent"' in statement for statement in statements))

    def test_mark_failed_persists_safe_generic_failure_reason(self):
        cursor = FakeCursor(select_result=(1,))

        with patch("app.db_persistence.db.connect", return_value=ConnectionContext(cursor)):
            db_persistence.mark_failed(
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
                "paddleocr",
                RuntimeError(r"C:\Users\Alex\private-receipts\receipt.pdf provider token leaked"),
            )

        serialized_params = "\n".join(str(params) for _statement, params in cursor.statements if params is not None)
        self.assertIn("extraction_failed", serialized_params)
        self.assertNotIn("private-receipts", serialized_params)
        self.assertNotIn("provider token", serialized_params)

    def test_mark_failed_preserves_known_safe_failure_code(self):
        cursor = FakeCursor(select_result=(1,))

        with patch("app.db_persistence.db.connect", return_value=ConnectionContext(cursor)):
            db_persistence.mark_failed(
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
                "paddleocr",
                PdfPageLimitExceeded("pdf_page_limit_exceeded"),
            )

        serialized_params = "\n".join(str(params) for _statement, params in cursor.statements if params is not None)
        self.assertIn("pdf_page_limit_exceeded", serialized_params)


if __name__ == "__main__":
    unittest.main()
