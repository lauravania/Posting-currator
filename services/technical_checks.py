"""
Fast, classical computer-vision checks run on every photo before the (much
slower/costlier) Anthropic vision call: blur via Laplacian variance,
exposure via a brightness histogram, and face/eyes-open detection via
OpenCV's bundled Haar cascades.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

BLUR_VARIANCE_THRESHOLD = 100.0  # below this, Laplacian variance flags "blurry"
UNDEREXPOSED_MEAN = 60.0   # 0-255 grayscale mean
OVEREXPOSED_MEAN = 200.0
CLIPPING_FRACTION_THRESHOLD = 0.35  # share of pixels near-black/near-white

_face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
_eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye_tree_eyeglasses.xml")


def _read_image(path: Path) -> np.ndarray:
    # cv2.imread chokes on non-ASCII / unusual paths on some platforms;
    # np.fromfile + imdecode is a more portable read.
    data = np.fromfile(str(path), dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Could not read image: {path}")
    return img


def analyze_technical(path: Path) -> dict:
    img = _read_image(path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Downscale for speed on very large camera-original files; the metrics
    # below are scale-invariant enough for a pass/fail heuristic.
    h, w = gray.shape[:2]
    max_dim = 1600
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

    # --- Blur ---
    blur_variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    is_blurry = blur_variance < BLUR_VARIANCE_THRESHOLD

    # --- Exposure ---
    brightness_mean = float(gray.mean())
    total_px = gray.size
    near_black = float(np.count_nonzero(gray < 15)) / total_px
    near_white = float(np.count_nonzero(gray > 240)) / total_px
    is_underexposed = brightness_mean < UNDEREXPOSED_MEAN or near_black > CLIPPING_FRACTION_THRESHOLD
    is_overexposed = brightness_mean > OVEREXPOSED_MEAN or near_white > CLIPPING_FRACTION_THRESHOLD
    exposure_ok = not (is_underexposed or is_overexposed)

    # --- Faces / eyes-open ---
    faces = _face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
    faces_detected = int(len(faces))
    eyes_open_count = 0
    for (fx, fy, fw, fh) in faces:
        face_roi = gray[fy:fy + fh, fx:fx + fw]
        eyes = _eye_cascade.detectMultiScale(face_roi, scaleFactor=1.1, minNeighbors=6, minSize=(15, 15))
        if len(eyes) >= 1:
            eyes_open_count += 1

    eyes_open_ratio = (eyes_open_count / faces_detected) if faces_detected else None

    return {
        "blur_variance": round(blur_variance, 1),
        "is_blurry": is_blurry,
        "brightness_mean": round(brightness_mean, 1),
        "exposure_ok": exposure_ok,
        "is_underexposed": is_underexposed,
        "is_overexposed": is_overexposed,
        "faces_detected": faces_detected,
        "eyes_open_count": eyes_open_count,
        "eyes_open_ratio": round(eyes_open_ratio, 2) if eyes_open_ratio is not None else None,
    }
