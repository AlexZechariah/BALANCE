from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from .. import settings


@dataclass
class RenderedPages:
    tmpdir: tempfile.TemporaryDirectory[str]
    image_paths: list[str]

    def cleanup(self) -> None:
        self.tmpdir.cleanup()


def render_pdf_pages(file_path: str) -> RenderedPages:
    tmpdir = tempfile.TemporaryDirectory(prefix="balance-pdf-")
    out_prefix = str(Path(tmpdir.name) / "page")
    result = subprocess.run(
        ["pdftoppm", "-r", str(settings.PDF_OCR_DPI), "-png", "-f", "1", "-l", str(settings.PDF_MAX_PAGES), file_path, out_prefix],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        tmpdir.cleanup()
        raise RuntimeError(result.stderr.strip() or "pdftoppm failed")
    pages = [str(path) for path in sorted(Path(tmpdir.name).glob("page-*.png"))]
    if not pages:
        tmpdir.cleanup()
        raise RuntimeError("pdf_text_empty")
    return RenderedPages(tmpdir=tmpdir, image_paths=pages)
