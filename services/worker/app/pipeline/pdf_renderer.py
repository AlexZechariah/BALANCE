from __future__ import annotations

import tempfile
from dataclasses import dataclass
from pathlib import Path
import time

import fitz

from .. import settings
from ..observability import record_pdf_render, start_span


class PdfPageLimitExceeded(RuntimeError):
    pass


@dataclass
class RenderedPages:
    tmpdir: tempfile.TemporaryDirectory[str]
    image_paths: list[str]

    def cleanup(self) -> None:
        self.tmpdir.cleanup()


def count_pdf_pages(file_path: str) -> int:
    with fitz.open(file_path) as document:
        return int(document.page_count)


def assert_pdf_page_limit(page_count: int) -> None:
    if page_count > settings.OCR_MAX_PAGES_LOCAL:
        raise PdfPageLimitExceeded("pdf_page_limit_exceeded")


def render_pdf_pages(file_path: str) -> RenderedPages:
    start = time.perf_counter()
    tmpdir = tempfile.TemporaryDirectory(prefix="balance-pdf-")
    scale = settings.PDF_OCR_DPI / 72
    matrix = fitz.Matrix(scale, scale)
    pages: list[str] = []

    try:
        with start_span("worker.pdf.render", {"balance.worker.pdf_max_pages": settings.OCR_MAX_PAGES_LOCAL}):
            with fitz.open(file_path) as document:
                page_count = int(document.page_count)
                assert_pdf_page_limit(page_count)
                for page_index in range(page_count):
                    page = document.load_page(page_index)
                    pixmap = page.get_pixmap(matrix=matrix, alpha=False)
                    out_path = Path(tmpdir.name) / f"page-{page_index + 1:06d}.png"
                    pixmap.save(out_path)
                    pages.append(str(out_path))
    except PdfPageLimitExceeded as exc:
        tmpdir.cleanup()
        record_pdf_render("failure", time.perf_counter() - start, error=exc)
        raise
    except Exception as exc:
        tmpdir.cleanup()
        record_pdf_render("failure", time.perf_counter() - start, error=exc)
        raise RuntimeError(f"pdf_render_failed:{exc}") from exc

    if not pages:
        tmpdir.cleanup()
        error = RuntimeError("pdf_text_empty")
        record_pdf_render("failure", time.perf_counter() - start, error=error)
        raise error
    record_pdf_render("success", time.perf_counter() - start, page_count=len(pages))
    return RenderedPages(tmpdir=tmpdir, image_paths=pages)
