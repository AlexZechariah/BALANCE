from __future__ import annotations


def preprocess_image(image_path: str) -> str:
    try:
        import cv2
    except Exception:
        return image_path

    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return image_path
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
