from __future__ import annotations

import warnings

from .. import settings


class ImagePixelLimitExceeded(RuntimeError):
    pass


def _image_size(image_path: str) -> tuple[int, int]:
    try:
        from PIL import Image
    except Exception:
        return (0, 0)

    Image.MAX_IMAGE_PIXELS = settings.OCR_MAX_IMAGE_PIXELS
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        try:
            with Image.open(image_path) as image:
                return image.size
        except Image.DecompressionBombWarning as exc:
            raise ImagePixelLimitExceeded("image_pixel_limit_exceeded") from exc


def _assert_image_limit(image_path: str) -> None:
    width, height = _image_size(image_path)
    if width <= 0 or height <= 0:
        return
    if width * height > settings.OCR_MAX_IMAGE_PIXELS:
        raise ImagePixelLimitExceeded("image_pixel_limit_exceeded")


def _strip_metadata_with_pillow(image_path: str) -> str:
    try:
        from PIL import Image
    except Exception:
        return image_path

    out_path = f"{image_path}.preprocessed.png"
    with Image.open(image_path) as image:
        image.load()
        image.convert("L").save(out_path, "PNG")
    return out_path


def preprocess_image(image_path: str) -> str:
    _assert_image_limit(image_path)

    try:
        import cv2
    except Exception:
        return _strip_metadata_with_pillow(image_path)

    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return _strip_metadata_with_pillow(image_path)
    denoised = cv2.fastNlMeansDenoising(img, None, 10, 7, 21)
    thresholded = cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11,
    )
    out_path = f"{image_path}.preprocessed.png"
    cv2.imwrite(out_path, thresholded)
    return out_path
