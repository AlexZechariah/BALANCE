import os


def _runtime_env() -> str:
    return (os.getenv("APP_ENV") or os.getenv("NODE_ENV") or "local").strip().lower()


def _env_int(name: str, fallback: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return fallback
    try:
        return int(raw)
    except ValueError:
        return fallback


APP_ENV = _runtime_env()


def env(name: str, fallback: str | None = None) -> str:
    value = os.getenv(name)
    if value is not None and value.strip() != "":
        return value.strip()
    if APP_ENV in {"staging", "production"} and name in {"DATABASE_URL"}:
        raise RuntimeError(f"{name} is required in {APP_ENV}")
    if fallback is not None:
        return fallback
    raise RuntimeError(f"{name} is required")


REDIS_URL = env("REDIS_URL", "redis://redis:6379")
QUEUE_PROOF_NAME = env("QUEUE_PROOF_NAME", "queue_proof")
EXTRACTION_QUEUE_NAME = env("EXTRACTION_QUEUE_NAME", "document_extract")

DATABASE_URL = env("DATABASE_URL", "postgresql://balance:balance@postgres:5432/balance?schema=public")

AWS_REGION = env("AWS_REGION", "")
OBJECT_STORAGE_PROVIDER = env("OBJECT_STORAGE_PROVIDER", env("STORAGE_DRIVER", "filesystem")).lower()
STORAGE_DRIVER = env("STORAGE_DRIVER", "filesystem").lower()
STORAGE_FILESYSTEM_ROOT = env("OBJECT_STORAGE_FILESYSTEM_ROOT", env("STORAGE_FILESYSTEM_ROOT", "/data/balance-storage"))
S3_BUCKET = env("S3_BUCKET", "")
S3_REGION = env("S3_REGION", AWS_REGION)
OBJECT_STORAGE_ARTIFACT_ROOT = env("OBJECT_STORAGE_ARTIFACT_ROOT", f"{STORAGE_FILESYSTEM_ROOT.rstrip('/')}/artifacts")

OCR_PROVIDER = env("OCR_PROVIDER", env("EXTRACTION_PROVIDER_DEFAULT", "paddleocr")).lower()
EXTRACTION_PROVIDER_DEFAULT = env("EXTRACTION_PROVIDER_DEFAULT", OCR_PROVIDER).lower()
EXTRACTION_ALLOW_LEGACY_TEXTRACT = env("EXTRACTION_ALLOW_LEGACY_TEXTRACT", "false").lower() == "true"
OCR_ENABLE_TESSERACT_FALLBACK = env("OCR_ENABLE_TESSERACT_FALLBACK", "true").lower() == "true"
TESSERACT_LANG = env("TESSERACT_LANG", "eng")
PIPELINE_VERSION = env("PIPELINE_VERSION", "v0.5.0-open-ocr")
PDF_OCR_DPI = _env_int("PDF_OCR_DPI", 300)
PDF_MAX_PAGES = _env_int("PDF_MAX_PAGES", 3)

TEXTRACT_PREPROCESS = env("TEXTRACT_PREPROCESS", "false").lower() == "true"
TEXTRACT_SCRATCH_PREFIX = env("TEXTRACT_SCRATCH_PREFIX", "textract-scratch")
TEXTRACT_CONFIDENCE_AUTO = _env_int("TEXTRACT_CONFIDENCE_AUTO", 90)
TEXTRACT_CONFIDENCE_FLAG = _env_int("TEXTRACT_CONFIDENCE_FLAG", 50)
