from __future__ import annotations

"""Legacy AWS Textract worker retained disabled for historical compatibility.

The active v0.5 queue entrypoint is app.open_ocr_worker.process_extraction.
"""

import datetime
import hashlib
import json
import os
import tempfile
import uuid
from pathlib import Path

import re
import logging

import boto3
from botocore.exceptions import ClientError, NoCredentialsError, PartialCredentialsError

from . import db, ocr, settings

logger = logging.getLogger(__name__)


def _filesystem_path(root_dir: str, storage_key: str) -> str:
    normalized_key = storage_key.lstrip("/")
    root = Path(root_dir).resolve()
    target = (root / normalized_key).resolve()
    if root != target and root not in target.parents:
        raise RuntimeError("invalid storage key")
    return str(target)


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)

def _uuid() -> str:
    return str(uuid.uuid4())

def _s3_key(storage_key: str) -> str:
    return (storage_key or "").lstrip("/")

def _file_suffix(content_type: str) -> str:
    normalized = (content_type or "").lower().strip()
    if normalized == "application/pdf":
        return ".pdf"
    if normalized == "image/png":
        return ".png"
    if normalized == "image/jpeg":
        return ".jpg"
    return ".bin"

def _download_s3_to_tempfile(bucket: str, key: str, region: str | None, content_type: str) -> str:
    if not bucket or not bucket.strip():
        raise RuntimeError("S3_BUCKET is required for s3 storage")

    suffix = _file_suffix(content_type)
    # Keep the file on disk until we're done OCR-ing; we delete it explicitly.
    tmp = tempfile.NamedTemporaryFile(prefix="balance-s3-", suffix=suffix, delete=False)
    try:
        client_kwargs: dict[str, object] = {}
        if region and region.strip():
            client_kwargs["region_name"] = region.strip()

        s3 = boto3.client("s3", **client_kwargs)
        try:
            s3.download_fileobj(bucket, key, tmp)
        except (NoCredentialsError, PartialCredentialsError) as e:
            raise RuntimeError(
                "AWS credentials are missing in the worker container. "
                "S3 download failed (required for Textract PDF workflows and s3 storage)."
            ) from e
        except ClientError as e:
            code = ((e.response.get("Error") or {}).get("Code") or "").strip() if hasattr(e, "response") else ""
            code_lower = code.lower()
            if code_lower in {"expiredtoken", "expiredtokenexception"}:
                raise RuntimeError(
                    "AWS credentials in the worker container have expired. "
                    "Refresh the runtime AWS credential source and retry extraction."
                ) from e
            if "accessdenied" in code_lower:
                raise RuntimeError("S3 access denied for worker credentials. Check IAM policy for the bucket.") from e
            raise
        tmp.flush()
        return tmp.name
    finally:
        tmp.close()

def _upload_file_to_s3(bucket: str, key: str, region: str | None, file_path: str) -> None:
    if not bucket or not bucket.strip():
        raise RuntimeError("S3_BUCKET is required for Textract PDF scratch upload")

    client_kwargs: dict[str, object] = {}
    if region and region.strip():
        client_kwargs["region_name"] = region.strip()

    s3 = boto3.client("s3", **client_kwargs)
    with open(file_path, "rb") as body:
        try:
            s3.upload_fileobj(body, bucket, key)
        except (NoCredentialsError, PartialCredentialsError) as e:
            raise RuntimeError(
                "AWS credentials are missing in the worker container. "
                "Textract PDF scratch upload requires authenticated S3 access."
            ) from e
        except ClientError as e:
            code = ((e.response.get("Error") or {}).get("Code") or "").strip() if hasattr(e, "response") else ""
            code_lower = code.lower()
            if code_lower in {"expiredtoken", "expiredtokenexception"}:
                raise RuntimeError(
                    "AWS credentials in the worker container have expired. "
                    "Refresh the runtime AWS credential source and retry extraction."
                ) from e
            if "accessdenied" in code_lower:
                raise RuntimeError("S3 access denied for worker credentials. Check IAM policy for the bucket.") from e
            raise


def _delete_s3_object(bucket: str, key: str, region: str | None) -> None:
    if not bucket or not bucket.strip() or not key:
        return

    client_kwargs: dict[str, object] = {}
    if region and region.strip():
        client_kwargs["region_name"] = region.strip()

    s3 = boto3.client("s3", **client_kwargs)
    try:
        s3.delete_object(Bucket=bucket, Key=key)
    except Exception:
        # Best-effort cleanup only; caller already treats failures as non-blocking.
        return

def _norm_provider(value: str | None) -> str:
    return (value or "").strip().lower()


def _norm_storage_driver(value: str | None) -> str:
    normalized = (value or "").strip().lower()
    if normalized == "s3":
        return "s3"
    return "filesystem"


def _textract_client(region: str | None):
    from botocore.config import Config
    client_kwargs: dict[str, object] = {
        "config": Config(retries={"max_attempts": 5, "mode": "adaptive"})
    }
    if region and region.strip():
        client_kwargs["region_name"] = region.strip()
    return boto3.client("textract", **client_kwargs)


def _extract_expense_summary_fields(textract_response: dict) -> dict[str, object]:
    """
    Extract ALL fields from Textract AnalyzeExpense / GetExpenseAnalysis response.

    Returns a dict with:
    - extracted_fields: list of {name, value, confidence, source} for ALL summary fields
    - line_items: list of [{groupKey, fields: [{name, value, confidence, source}]}]
    - warnings: list of cross-validation warning strings
    - needs_review: bool indicating if human review is needed
    """
    docs = textract_response.get("ExpenseDocuments") or []
    if not docs:
        return {"extracted_fields": [], "line_items": [], "warnings": [], "needs_review": False}

    doc = docs[0] or {}
    summary_fields = doc.get("SummaryFields") or []
    line_item_groups = doc.get("LineItemGroups") or []

    TEXT_TYPE_MAP = {
        "VENDOR_NAME": "merchantName",
        "VENDOR_ADDRESS": "vendorAddress",
        "VENDOR_PHONE": "vendorPhone",
        "VENDOR_URL": None,        # Not in enum — include as "other"?
        "INVOICE_RECEIPT_DATE": "documentDate",
        "INVOICE_RECEIPT_ID": "invoiceReceiptId",
        "ORDER_DATE": "orderDate",
        "DUE_DATE": "dueDate",
        "RECEIVER_NAME": "receiverName",
        "RECEIVER_ADDRESS": "receiverAddress",
        "RECEIVER_PHONE": None,
        "TOTAL": "amountMinor",
        "SUBTOTAL": "subtotal",
        "AMOUNT_DUE": "amountDue",
        "TAX": "tax",
        "DISCOUNT": "discount",
        "SHIPPING_HANDLING_CHARGE": "shippingCharge",
        "SERVICE_CHARGE": "serviceCharge",
        "GRATUITY": "gratuity",
        "PAYMENT_TERMS": "paymentTerms",
        "PAYMENT_TYPE": "paymentType",
        "PO_NUMBER": "poNumber",
        "CURRENCY": None,           # Handled via Currency.Code on monetary fields
        "ADDRESS_BLOCK": None,      # Handled via ADDRESS_BLOCK → component parsing
        "STREET": None,
        "CITY": None,
        "STATE": None,
        "COUNTRY": None,
        "ZIP_CODE": None,
    }

    LINE_ITEM_TYPE_MAP = {
        "ITEM": "lineItemDescription",
        "QUANTITY": "lineItemQuantity",
        "UNIT_PRICE": "lineItemUnitPrice",
        "PRICE": "lineItemTotalPrice",
        "PRODUCT_CODE": "lineItemProductCode",
        "TAX": "lineItemTax",
    }

    def _field_type(sf: dict) -> str:
        return ((sf.get("Type") or {}).get("Text") or "").strip().upper()

    def _value_text(sf: dict) -> str:
        return ((sf.get("ValueDetection") or {}).get("Text") or "").strip()

    def _value_confidence(sf: dict) -> float | None:
        conf = ((sf.get("ValueDetection") or {}).get("Confidence"))
        if conf is not None:
            return float(conf)
        return None

    def _currency_code(sf: dict) -> str | None:
        """Extract Textract's native Currency.Code from a monetary field."""
        currency = (sf.get("ValueDetection") or {}).get("Currency")
        if currency:
            code = (currency.get("Code") or "").strip()
            if code:
                return code
        return None

    def _page_number(field: dict) -> int | None:
        page = field.get("PageNumber") or (field.get("ValueDetection") or {}).get("Page")
        try:
            return int(page) if page is not None else None
        except (TypeError, ValueError):
            return None

    def _geometry(field: dict) -> dict | None:
        geometry = (field.get("ValueDetection") or {}).get("Geometry")
        if not geometry:
            return None
        return geometry

    def _raw_label(field: dict) -> str | None:
        label = (field.get("LabelDetection") or {}).get("Text")
        if label and str(label).strip():
            return str(label).strip()
        return None

    def _value_type(field_name: str, raw_type: str) -> str:
        if field_name in {
            "amountMinor",
            "total",
            "subtotal",
            "tax",
            "taxableAmount",
            "amountDue",
            "amountPaid",
            "discount",
            "voucher",
            "shippingCharge",
            "serviceCharge",
            "gratuity",
            "roundingAdjustment",
            "lineItemUnitPrice",
            "lineItemTotalPrice",
            "lineItemTax",
            "lineItemDiscount",
        }:
            return "money"
        if "DATE" in raw_type or field_name.endswith("Date"):
            return "date"
        if field_name.endswith("Time"):
            return "time"
        if field_name.endswith("Count") or field_name.endswith("Quantity"):
            return "number"
        return "text"

    def _field_record(name: str, value: str, confidence: float | None, source: str, raw_field: dict | None = None, group_key: str | None = None) -> dict:
        raw_type = ""
        if raw_field:
            raw_type = ((raw_field.get("Type") or {}).get("Text") or "").strip().upper()
        return {
            "name": name,
            "value": value,
            "confidence": confidence,
            "source": source,
            "groupKey": group_key,
            "rawType": raw_type or None,
            "rawLabel": _raw_label(raw_field or {}),
            "normalizedValue": value,
            "valueType": _value_type(name, raw_type),
            "pageNumber": _page_number(raw_field or {}),
            "geometry": _geometry(raw_field or {}),
            "validationStatus": "needs_review" if confidence is not None and confidence < settings.TEXTRACT_CONFIDENCE_FLAG else "extracted",
            "reviewState": "open" if confidence is not None and confidence < settings.TEXTRACT_CONFIDENCE_FLAG else "accepted",
            "metadata": {
                "textractType": raw_type or None,
                "confidenceThreshold": settings.TEXTRACT_CONFIDENCE_FLAG,
            },
        }

    def _parse_amount_to_minor(raw: str) -> int | None:
        cleaned = (raw or "").strip()
        if not cleaned:
            return None
        cleaned = "".join(c for c in cleaned if c.isdigit() or c in {".", ","})
        cleaned = cleaned.replace(",", "")
        if not cleaned:
            return None
        try:
            if "." in cleaned:
                return int(round(float(cleaned) * 100))
            return int(cleaned) * 100
        except ValueError:
            return None

    def _normalize_date(raw: str) -> str:
        """Normalize date to ISO 8601 YYYY-MM-DD."""
        raw = (raw or "").strip()
        if not raw:
            return raw
        
        month_names = {
            "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
            "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
        }
        
        # YYYY-MM-DD or YYYY/MM/DD
        m = re.match(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})$", raw)
        if m:
            return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
        
        # DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
        m = re.match(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$", raw)
        if m:
            return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
        
        # DD Mon YYYY (e.g., "16 Apr 2025")
        m = re.match(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$", raw)
        if m:
            month_num = month_names.get(m.group(2).lower()[:3], 1)
            return f"{m.group(3)}-{month_num:02d}-{int(m.group(1)):02d}"
        
        # Mon DD, YYYY (e.g., "Apr 16, 2025")
        m = re.match(r"([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$", raw)
        if m:
            month_num = month_names.get(m.group(1).lower()[:3], 1)
            return f"{m.group(3)}-{month_num:02d}-{int(m.group(2)):02d}"
        
        return raw  # Return as-is if no pattern matches

    extracted: list[dict] = []
    raw_values: dict[str, str] = {}   # Keep raw values for cross-validation
    currency_codes: list[str] = []
    addresses: dict[str, str] = {}    # Full address blocks for parsing

    # ── Process SummaryFields ──
    for sf in summary_fields:
        ftype = _field_type(sf)
        value = _value_text(sf)
        confidence = _value_confidence(sf)

        if not value:
            continue

        # Capture addresses for component splitting
        if ftype in ("VENDOR_ADDRESS",):
            addresses["vendor"] = value
        if ftype in ("RECEIVER_ADDRESS",):
            addresses["receiver"] = value

        # Map to our field name
        field_name = TEXT_TYPE_MAP.get(ftype)
        if field_name is None:
            continue  # Skip unmapped fields (they're in raw_response anyway)

        # Get currency code for monetary fields
        currency = _currency_code(sf)
        if currency and currency not in currency_codes:
            currency_codes.append(currency)

        # Normalize dates
        if "DATE" in ftype or ftype == "INVOICE_RECEIPT_DATE":
            value = _normalize_date(value)

        # For TOTAL/AMOUNT_DUE — store both minor-unit and raw
        if ftype == "TOTAL":
            raw_values["total"] = value
        elif ftype == "SUBTOTAL":
            raw_values["subtotal"] = value
        elif ftype == "TAX":
            raw_values["tax"] = value
        elif ftype == "SHIPPING_HANDLING_CHARGE":
            raw_values["shipping"] = value
        elif ftype == "DISCOUNT":
            raw_values["discount"] = value
        elif ftype == "SERVICE_CHARGE":
            raw_values["service_charge"] = value
        elif ftype == "GRATUITY":
            raw_values["gratuity"] = value

        extracted.append(_field_record(field_name, value, confidence, "ocr", sf))

    # ── Add currency from Textract's Currency.Code ──
    if currency_codes:
        # Use the most common currency code found
        from collections import Counter
        best_currency = Counter(currency_codes).most_common(1)[0][0]
        if best_currency:
            extracted.append(_field_record("currency", best_currency, 99.0, "ocr"))

    # ── Address component parsing ──
    for prefix, full_address in addresses.items():
        if not full_address:
            continue
        # Parse address components from the full address string
        # Common patterns: "123 Main St, City, State Zip, Country"
        parts = [p.strip() for p in full_address.split(",")]
        if len(parts) >= 1:
            extracted.append(_field_record(f"{prefix}Address", full_address, None, "ocr"))
            # Street: first part
            extracted.append(_field_record(f"{prefix}Street" if prefix == "vendor" else "receiverStreet", parts[0], None, "ocr"))
        if len(parts) >= 2:
            # Last part often contains country
            last_part = parts[-1].strip()
            # Check for postal code in second-to-last or last
            zip_match = re.search(r"\b\d{4,6}(?:-\d{4})?\b", full_address)
            if zip_match:
                zip_prefix = "vendor" if prefix == "vendor" else "receiver"
                extracted.append(_field_record(f"{zip_prefix}PostalCode", zip_match.group(0), None, "ocr"))
            # Try to identify city/state
            if len(parts) >= 2:
                city_state = parts[-2] if len(parts) >= 2 else parts[1]
                cs_parts = [p.strip() for p in re.split(r"\s{2,}|\t", city_state) if p.strip()]
                metro_part = cs_parts[0] if cs_parts else city_state
                # Metro area could be "City, ST" or "City ST"
                metro_match = re.match(r"(.+?)[, ]+([A-Z]{2,}(?:\s+[A-Z]{2,})?)$", metro_part)
                if metro_match:
                    city_name = metro_match.group(1).strip()
                    state_code = metro_match.group(2).strip()
                    city_key = f"{prefix}City" if prefix == "vendor" else "receiverCity"
                    state_key = f"{prefix}State" if prefix == "vendor" else "receiverState"
                    extracted.append(_field_record(city_key, city_name, None, "ocr"))
                    extracted.append(_field_record(state_key, state_code, None, "ocr"))

        # Country detection
        country_match = re.search(r",\s*([A-Z]{2})$", full_address)
        if country_match:
            country_key = f"{prefix}Country" if prefix == "vendor" else "receiverCountry"
            extracted.append(_field_record(country_key, country_match.group(1), None, "ocr"))

    # ── Process Line Items ──
    line_items: list[dict] = []
    for group_idx, group in enumerate(line_item_groups):
        for item_idx, line_item in enumerate(group.get("LineItems", [])):
            expense_fields = line_item.get("LineItemExpenseFields", [])
            item_fields: list[dict] = []
            group_key = f"li-{group_idx}-{item_idx}"
            
            for ef in expense_fields:
                eftype = ((ef.get("Type") or {}).get("Text") or "").strip().upper()
                efvalue = ((ef.get("ValueDetection") or {}).get("Text") or "").strip()
                efconf = None
                conf_val = (ef.get("ValueDetection") or {}).get("Confidence")
                if conf_val is not None:
                    efconf = float(conf_val)
                
                if not efvalue:
                    continue
                
                mapped_name = LINE_ITEM_TYPE_MAP.get(eftype)
                if mapped_name:
                    item_fields.append(_field_record(mapped_name, efvalue, efconf, "ocr", ef, group_key))
            
            if item_fields:
                line_items.append({
                    "groupKey": group_key,
                    "fields": item_fields,
                })

    # If no line items from Textract, try raw EXPENSE_ROW
    if not line_items:
        for group_idx, group in enumerate(line_item_groups):
            for item_idx, line_item in enumerate(group.get("LineItems", [])):
                expense_fields = line_item.get("LineItemExpenseFields", [])
                for ef in expense_fields:
                    eftype = ((ef.get("Type") or {}).get("Text") or "").strip().upper()
                    if eftype == "EXPENSE_ROW":
                        efvalue = ((ef.get("ValueDetection") or {}).get("Text") or "").strip()
                        if efvalue:
                            group_key = f"li-{group_idx}-{item_idx}"
                            line_items.append({
                                "groupKey": group_key,
                                "fields": [_field_record("lineItemDescription", efvalue, None, "ocr", ef, group_key)],
                            })

    # ── Financial cross-validation ──
    warnings: list[str] = []
    needs_review = False

    def _parse_float(raw: str) -> float | None:
        cleaned = raw.replace(",", "").strip()
        try:
            return float(cleaned)
        except (ValueError, TypeError):
            return None

    try:
        total = _parse_float(raw_values.get("total", ""))
        subtotal = _parse_float(raw_values.get("subtotal", ""))
        tax_val = _parse_float(raw_values.get("tax", ""))
        shipping = _parse_float(raw_values.get("shipping", ""))
        discount = _parse_float(raw_values.get("discount", ""))
        service = _parse_float(raw_values.get("service_charge", ""))
        gratuity = _parse_float(raw_values.get("gratuity", ""))

        if total is not None:
            # Validate: TOTAL ≈ SUBTOTAL + TAX + SHIPPING - DISCOUNT + SERVICE + GRATUITY
            computed = 0.0
            if subtotal is not None:
                computed += subtotal
            if tax_val is not None:
                computed += tax_val
            if shipping is not None:
                computed += shipping
            if discount is not None:
                computed -= discount
            if service is not None:
                computed += service
            if gratuity is not None:
                computed += gratuity

            if computed > 0 and abs(total - computed) > 1.00:
                warnings.append(
                    f"TOTAL ({total:.2f}) differs significantly from calculated value ({computed:.2f})"
                )
                needs_review = True
    except Exception:
        logger.warning("Amount validation failed", exc_info=True)

    # ── Decide document status ──
    # Check if we have the essential fields
    has_merchant = any(f["name"] == "merchantName" and f["value"] for f in extracted)
    has_amount = any(f["name"] == "amountMinor" for f in extracted)
    is_usable = has_merchant or has_amount

    return {
        "extracted_fields": extracted,
        "line_items": line_items,
        "warnings": warnings,
        "needs_review": needs_review,
        "has_merchant": has_merchant,
        "has_amount": has_amount,
        "is_usable": is_usable,
        "raw_response": textract_response,
    }


def _textract_analyze_expense_from_bytes(document_bytes: bytes, region: str | None) -> dict:
    textract = _textract_client(region)
    try:
        return textract.analyze_expense(Document={"Bytes": document_bytes})
    except (NoCredentialsError, PartialCredentialsError) as e:
        raise RuntimeError(
            "AWS credentials are missing in the worker container. "
            "Textract AnalyzeExpense requires authenticated AWS access."
        ) from e
    except ClientError as e:
        code = ((e.response.get("Error") or {}).get("Code") or "").strip() if hasattr(e, "response") else ""
        code_lower = code.lower()
        if code_lower in {"expiredtoken", "expiredtokenexception"}:
            raise RuntimeError(
                "AWS credentials in the worker container have expired. "
                "Refresh the runtime AWS credential source and retry extraction."
            ) from e
        if "accessdenied" in code_lower:
            raise RuntimeError("Textract access denied for worker credentials. Check IAM permissions.") from e
        raise


def _textract_analyze_expense_from_s3(bucket: str, key: str, region: str | None) -> dict:
    textract = _textract_client(region)
    try:
        return textract.analyze_expense(Document={"S3Object": {"Bucket": bucket, "Name": key}})
    except (NoCredentialsError, PartialCredentialsError) as e:
        raise RuntimeError(
            "AWS credentials are missing in the worker container. "
            "Textract AnalyzeExpense (S3Object) requires authenticated AWS access."
        ) from e
    except ClientError as e:
        code = ((e.response.get("Error") or {}).get("Code") or "").strip() if hasattr(e, "response") else ""
        code_lower = code.lower()
        if code_lower in {"expiredtoken", "expiredtokenexception"}:
            raise RuntimeError(
                "AWS credentials in the worker container have expired. "
                "Refresh the runtime AWS credential source and retry extraction."
            ) from e
        if "accessdenied" in code_lower:
            raise RuntimeError("Textract access denied for worker credentials. Check IAM permissions.") from e
        raise


def _textract_start_expense_analysis(bucket: str, key: str, region: str | None) -> str:
    textract = _textract_client(region)
    try:
        resp = textract.start_expense_analysis(DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}})
    except (NoCredentialsError, PartialCredentialsError) as e:
        raise RuntimeError(
            "AWS credentials are missing in the worker container. "
            "Textract StartExpenseAnalysis requires authenticated AWS access."
        ) from e
    except ClientError as e:
        code = ((e.response.get("Error") or {}).get("Code") or "").strip() if hasattr(e, "response") else ""
        code_lower = code.lower()
        if code_lower in {"expiredtoken", "expiredtokenexception"}:
            raise RuntimeError(
                "AWS credentials in the worker container have expired. "
                "Refresh the runtime AWS credential source and retry extraction."
            ) from e
        if "accessdenied" in code_lower:
            raise RuntimeError("Textract access denied for worker credentials. Check IAM permissions.") from e
        raise
    return resp.get("JobId") or ""


def _textract_get_expense_analysis(job_id: str, region: str | None) -> dict:
    textract = _textract_client(region)
    next_token: str | None = None
    out: dict | None = None
    while True:
        kwargs: dict[str, object] = {"JobId": job_id, "MaxResults": 1000}
        if next_token:
            kwargs["NextToken"] = next_token
        try:
            resp = textract.get_expense_analysis(**kwargs)
        except (NoCredentialsError, PartialCredentialsError) as e:
            raise RuntimeError(
                "AWS credentials are missing in the worker container. "
                "Textract GetExpenseAnalysis requires authenticated AWS access."
            ) from e
        except ClientError as e:
            code = ((e.response.get("Error") or {}).get("Code") or "").strip() if hasattr(e, "response") else ""
            code_lower = code.lower()
            if code_lower in {"expiredtoken", "expiredtokenexception"}:
                raise RuntimeError(
                    "AWS credentials in the worker container have expired. "
                    "Refresh the runtime AWS credential source and retry extraction."
                ) from e
            if "accessdenied" in code_lower:
                raise RuntimeError("Textract access denied for worker credentials. Check IAM permissions.") from e
            raise
        if out is None:
            out = resp
        else:
            out.setdefault("ExpenseDocuments", [])
            out["ExpenseDocuments"].extend(resp.get("ExpenseDocuments") or [])
        next_token = resp.get("NextToken")
        if not next_token:
            break
    return out or {}


async def process_extraction(job, _job_token):
    data = job.data or {}

    extraction_job_id = data.get("extractionJobId")
    document_id = data.get("documentId")
    storage_key = data.get("storageKey")
    storage_driver = _norm_storage_driver(data.get("storageDriver")) if data.get("storageDriver") is not None else _norm_storage_driver(settings.STORAGE_DRIVER)
    content_type = data.get("contentType")
    provider = _norm_provider(data.get("provider")) or _norm_provider(settings.OCR_PROVIDER) or "textract"

    if not extraction_job_id or not document_id or not storage_key or not content_type:
        raise RuntimeError("missing job payload fields")
    if provider != "textract":
        raise RuntimeError(f"Unsupported OCR provider '{provider}'. Balance extraction is Textract-first.")

    conn = db.connect(settings.DATABASE_URL)
    temp_download_path: str | None = None
    try:
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE "ExtractionJob" SET status=%s::"ExtractionJobStatus", "startedAt"=%s WHERE id=%s',
                ("processing", _now(), extraction_job_id),
            )
            cur.execute(
                'UPDATE "Document" SET status=%s::"DocumentStatus", "updatedAt"=%s WHERE id=%s',
                ("processing", _now(), document_id),
            )
            cur.execute(
                'INSERT INTO "AuditEvent" (id, action, "entityType", "entityId", "actorId", "actorRole", message, metadata, "createdAt", "documentId", "extractionJobId") '
                'VALUES (%s::uuid, %s, %s::"EntityType", %s, %s, %s, %s, %s::jsonb, %s, %s, %s)',
                (
                    _uuid(),
                    "extraction.started",
                    "document",
                    document_id,
                    None,
                    "system",
                    "Extraction started",
                    json.dumps({"provider": provider, "storageDriver": storage_driver}),
                    _now(),
                    document_id,
                    extraction_job_id,
                ),
            )

        file_path = None
        s3_key = _s3_key(storage_key)

        if (content_type or "").lower().strip() == "application/pdf":
            # Textract's async AnalyzeExpense flow is the supported path for PDFs.
            # (Sync AnalyzeExpense with Bytes is intended for images; PDFs typically require S3.)
            if not settings.S3_BUCKET or not settings.S3_BUCKET.strip():
                raise RuntimeError("S3_BUCKET is required for Textract PDF extraction")

            scratch_key: str | None = None
            textract_key = s3_key

            if storage_driver == "filesystem":
                file_path = _filesystem_path(settings.STORAGE_FILESYSTEM_ROOT, storage_key)
                scratch_prefix = (settings.TEXTRACT_SCRATCH_PREFIX or "textract-scratch").strip().strip("/")
                scratch_key = f"{scratch_prefix}/{document_id}/{extraction_job_id}.pdf"
                _upload_file_to_s3(settings.S3_BUCKET, scratch_key, settings.S3_REGION or None, file_path)
                textract_key = scratch_key

            try:
                job_id = _textract_start_expense_analysis(settings.S3_BUCKET, textract_key, settings.S3_REGION or None)
                if not job_id:
                    raise RuntimeError("Textract StartExpenseAnalysis did not return JobId")

                import time

                timeout_seconds = float(os.getenv("TEXTRACT_PDF_TIMEOUT_SECONDS", "120") or "120")
                deadline = time.time() + timeout_seconds
                while True:
                    resp = _textract_get_expense_analysis(job_id, settings.S3_REGION or None)
                    status = (resp.get("JobStatus") or "").upper()
                    if status in {"SUCCEEDED", "FAILED"}:
                        if status == "FAILED":
                            raise RuntimeError("Textract expense analysis failed")
                        result = _extract_expense_summary_fields(resp)
                        result["textractJobId"] = job_id
                        result["scratchKey"] = scratch_key
                        break
                    if time.time() > deadline:
                        raise RuntimeError("Textract expense analysis timed out")
                    time.sleep(2.0)
            finally:
                if scratch_key:
                    try:
                        _delete_s3_object(settings.S3_BUCKET, scratch_key, settings.S3_REGION or None)
                    except Exception:
                        logger.warning("Failed to delete Textract scratch object", exc_info=True)
        else:
            if storage_driver == "filesystem":
                file_path = _filesystem_path(settings.STORAGE_FILESYSTEM_ROOT, storage_key)
            else:
                temp_download_path = _download_s3_to_tempfile(
                    settings.S3_BUCKET,
                    s3_key,
                    settings.S3_REGION or None,
                    content_type,
                )
                file_path = temp_download_path

            normalized = (content_type or "").lower().strip()
            if normalized not in {"image/jpeg", "image/png"}:
                raise RuntimeError("Textract provider supports JPEG/PNG images and PDFs")

            document_bytes: bytes | None = None
            if settings.TEXTRACT_PREPROCESS:
                document_bytes = ocr.preprocess_for_textract(file_path)

            if storage_driver == "s3" and settings.S3_BUCKET and settings.S3_BUCKET.strip():
                if document_bytes is not None:
                    resp = _textract_analyze_expense_from_bytes(document_bytes, settings.S3_REGION or None)
                else:
                    resp = _textract_analyze_expense_from_s3(settings.S3_BUCKET, s3_key, settings.S3_REGION or None)
            else:
                if document_bytes is None:
                    with open(file_path, "rb") as f:
                        document_bytes = f.read()
                resp = _textract_analyze_expense_from_bytes(document_bytes, settings.S3_REGION or None)
            result = _extract_expense_summary_fields(resp)

        # Determine document status
        extracted_fields = result.get("extracted_fields", [])
        needs_review = result.get("needs_review", False)
        has_merchant = result.get("has_merchant", False)
        has_amount = result.get("has_amount", False)

        if needs_review:
            status = "correction_required"
        elif has_merchant or has_amount:
            status = "extracted"
        else:
            status = "correction_required"

        # ── Upsert ALL extracted fields ──
        with conn.cursor() as cur:
            def _upsert_field(field: dict, fallback_group_key: str) -> None:
                name = field.get("name")
                value = field.get("value")
                confidence = field.get("confidence")
                source = field.get("source", "ocr")
                group_key = field.get("groupKey") or fallback_group_key
                if not name or value is None:
                    return
                cur.execute(
                    'INSERT INTO "DocumentField" (id, "documentId", name, value, "correctedValue", confidence, source, "groupKey", "rawType", "rawLabel", "normalizedValue", "valueType", "pageNumber", geometry, "validationStatus", "reviewState", metadata, "createdAt", "updatedAt") '
                    'VALUES (%s::uuid, %s, %s::"FieldName", %s, NULL, %s, %s::"FieldSource", %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s::jsonb, %s, %s) '
                    'ON CONFLICT ("documentId", name, "groupKey") DO UPDATE SET value=EXCLUDED.value, confidence=EXCLUDED.confidence, source=EXCLUDED.source, "rawType"=EXCLUDED."rawType", "rawLabel"=EXCLUDED."rawLabel", "normalizedValue"=EXCLUDED."normalizedValue", "valueType"=EXCLUDED."valueType", "pageNumber"=EXCLUDED."pageNumber", geometry=EXCLUDED.geometry, "validationStatus"=EXCLUDED."validationStatus", "reviewState"=EXCLUDED."reviewState", metadata=EXCLUDED.metadata, "updatedAt"=EXCLUDED."updatedAt"',
                    (
                        _uuid(),
                        document_id,
                        name,
                        str(value),
                        confidence,
                        source,
                        group_key,
                        field.get("rawType"),
                        field.get("rawLabel"),
                        field.get("normalizedValue"),
                        field.get("valueType"),
                        field.get("pageNumber"),
                        json.dumps(field.get("geometry")) if field.get("geometry") is not None else None,
                        field.get("validationStatus"),
                        field.get("reviewState"),
                        json.dumps(field.get("metadata") or {}),
                        _now(),
                        _now(),
                    ),
                )

            for ef in extracted_fields:
                _upsert_field(ef, "summary")

            # ── Upsert line item fields with groupKey ──
            for li_group in result.get("line_items", []):
                gk = li_group.get("groupKey")
                for lf in li_group.get("fields", []):
                    if gk:
                        _upsert_field(lf, str(gk))

            # ── Update document scalar columns (keep backward-compatible, also store TOTAL/minor) ──
            merchant_name = None
            document_date = None
            amount_minor = None
            currency_val = None
            transaction_time = None
            invoice_receipt_id = None
            for ef in extracted_fields:
                if ef.get("name") == "merchantName":
                    merchant_name = ef.get("value")
                elif ef.get("name") == "documentDate":
                    document_date = ef.get("value")
                elif ef.get("name") == "amountMinor":
                    # Parse minor units from string value
                    minor = _parse_amount_str(ef.get("value", ""))
                    if minor is not None:
                        amount_minor = minor
                elif ef.get("name") == "currency":
                    currency_val = ef.get("value")
                elif ef.get("name") == "transactionTime":
                    transaction_time = ef.get("value")
                elif ef.get("name") in {"invoiceReceiptId", "receiptId", "invoiceId", "orderId"} and not invoice_receipt_id:
                    invoice_receipt_id = ef.get("value")

            confidences = [
                float(field["confidence"])
                for field in extracted_fields
                if field.get("confidence") is not None
            ]
            for group in result.get("line_items", []):
                for field in group.get("fields", []):
                    if field.get("confidence") is not None:
                        confidences.append(float(field["confidence"]))
            quality_score = int(round(sum(confidences) / len(confidences))) if confidences else None
            warnings = result.get("warnings", [])
            field_names = {str(field.get("name")) for field in extracted_fields}
            document_type = "invoice" if field_names.intersection({"invoiceId", "dueDate", "supplierName", "customerName", "poNumber"}) else "receipt"
            if (content_type or "").lower().strip() == "application/pdf" and document_type == "receipt":
                document_type = "receipt_pdf"
            fingerprint_parts = [
                (merchant_name or "").strip().lower(),
                (document_date or "").strip(),
                str(amount_minor or ""),
                (currency_val or "").strip().upper(),
                (invoice_receipt_id or "").strip().lower(),
            ]
            duplicate_fingerprint = hashlib.sha256("|".join(fingerprint_parts).encode("utf-8")).hexdigest() if any(fingerprint_parts) else None
            extraction_summary = {
                "provider": provider,
                "stage": "completed",
                "fieldsExtracted": len(extracted_fields),
                "lineItemsExtracted": len(result.get("line_items", [])),
                "warningsCount": len(warnings),
                "qualityScore": quality_score,
                "textractJobId": result.get("textractJobId"),
                "completedAt": _now().isoformat(),
            }

            cur.execute(
                'UPDATE "Document" SET status=%s::"DocumentStatus", "merchantName"=%s, "documentDate"=%s, "amountMinor"=%s, currency=%s, "documentType"=%s, "qualityScore"=%s, "qualityWarnings"=%s::jsonb, "duplicateFingerprint"=%s, "transactionDate"=%s, "transactionTime"=%s, "extractionSummary"=%s::jsonb, "updatedAt"=%s WHERE id=%s',
                (
                    status,
                    merchant_name,
                    document_date,
                    amount_minor,
                    currency_val,
                    document_type,
                    quality_score,
                    json.dumps(warnings),
                    duplicate_fingerprint,
                    document_date,
                    transaction_time,
                    json.dumps(extraction_summary),
                    _now(),
                    document_id,
                ),
            )

            normalized_artifact = {
                "provider": provider,
                "documentStatus": status,
                "documentType": document_type,
                "summary": extraction_summary,
                "fields": extracted_fields,
                "lineItems": result.get("line_items", []),
            }
            cur.execute(
                'INSERT INTO "ExtractionArtifact" (id, "extractionJobId", provider, "rawResponse", normalized, warnings, "createdAt") '
                'VALUES (%s::uuid, %s, %s::"ExtractionProvider", %s::jsonb, %s::jsonb, %s::jsonb, %s) '
                'ON CONFLICT ("extractionJobId") DO UPDATE SET provider=EXCLUDED.provider, "rawResponse"=EXCLUDED."rawResponse", normalized=EXCLUDED.normalized, warnings=EXCLUDED.warnings',
                (
                    _uuid(),
                    extraction_job_id,
                    provider,
                    json.dumps(result.get("raw_response") or {}),
                    json.dumps(normalized_artifact),
                    json.dumps(warnings),
                    _now(),
                ),
            )

            cur.execute(
                'UPDATE "ExtractionJob" SET status=%s::"ExtractionJobStatus", "completedAt"=%s, "errorMessage"=NULL WHERE id=%s',
                ("completed", _now(), extraction_job_id),
            )

            cur.execute(
                'INSERT INTO "AuditEvent" (id, action, "entityType", "entityId", "actorId", "actorRole", message, metadata, "createdAt", "documentId", "extractionJobId") '
                'VALUES (%s::uuid, %s, %s::"EntityType", %s, %s, %s, %s, %s::jsonb, %s, %s, %s)',
                (
                    _uuid(),
                    "extraction.completed",
                    "extraction_job",
                    extraction_job_id,
                    None,
                    "system",
                    "Extraction completed",
                    json.dumps(extraction_summary),
                    _now(),
                    document_id,
                    extraction_job_id,
                ),
            )

        # Report warnings as audit metadata
        warnings = result.get("warnings", [])
        if warnings:
            with conn.cursor() as cur:
                for w in warnings:
                    cur.execute(
                        'INSERT INTO "AuditEvent" (id, action, "entityType", "entityId", "actorId", "actorRole", message, metadata, "createdAt", "documentId", "extractionJobId") '
                        'VALUES (%s::uuid, %s, %s::"EntityType", %s, %s, %s, %s, %s::jsonb, %s, %s, %s)',
                        (
                            _uuid(),
                            "extraction.warning",
                            "document",
                            document_id,
                            None,
                            "system",
                            w,
                            json.dumps({"provider": provider, "warning": w}),
                            _now(),
                            document_id,
                            extraction_job_id,
                        ),
                    )

        summary_fields = {ef["name"]: ef["value"] for ef in extracted_fields}
        return {"status": status, "fields": summary_fields, "warnings": warnings}
    except Exception as e:
        # Best-effort failure persistence (same as before)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    'UPDATE "ExtractionJob" SET status=%s::"ExtractionJobStatus", "completedAt"=%s, "errorMessage"=%s WHERE id=%s',
                    ("failed", _now(), str(e)[:500], extraction_job_id),
                )
                cur.execute(
                    'UPDATE "Document" SET status=%s::"DocumentStatus", "updatedAt"=%s WHERE id=%s',
                    ("failed", _now(), document_id),
                )
                cur.execute(
                    'INSERT INTO "AuditEvent" (id, action, "entityType", "entityId", "actorId", "actorRole", message, metadata, "createdAt", "documentId", "extractionJobId") '
                    'VALUES (%s::uuid, %s, %s::"EntityType", %s, %s, %s, %s, %s::jsonb, %s, %s, %s)',
                    (
                        _uuid(),
                        "extraction.failed",
                        "document",
                        document_id,
                        None,
                        "system",
                        "Extraction failed",
                        json.dumps({"provider": provider, "error": str(e)[:500]}),
                        _now(),
                        document_id,
                        extraction_job_id,
                    ),
                )
        except Exception:
            pass
        raise
    finally:
        conn.close()
        if temp_download_path:
            try:
                os.remove(temp_download_path)
            except Exception:
                pass


def _parse_amount_str(raw: str) -> int | None:
    """Parse a string amount to minor units (e.g., '113.00' -> 11300)."""
    if not raw:
        return None
    cleaned = raw.replace(",", "").strip()
    if not cleaned:
        return None
    try:
        if "." in cleaned:
            return int(round(float(cleaned) * 100))
        return int(cleaned) * 100
    except (ValueError, TypeError):
        return None
