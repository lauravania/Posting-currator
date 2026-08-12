"""
Image helpers shared across the app: on-disk thumbnail generation for the
gallery views, and base64 downscaling for Anthropic vision calls.
"""
from __future__ import annotations

import base64
import hashlib
import io
from pathlib import Path
from typing import Tuple

from PIL import Image, ImageOps

from config import THUMBS_DIR

THUMB_MAX_DIM = 480
VISION_MAX_DIM = 1568  # keeps requests fast/cheap; well within Opus 5's high-res cap

_MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
}


def guess_media_type(path: Path) -> str:
    return _MEDIA_TYPES.get(path.suffix.lower(), "image/jpeg")


def _load_upright(path: Path) -> Image.Image:
    """Open an image and apply EXIF orientation so thumbnails/vision input
    aren't sideways."""
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    return img


def get_or_create_thumbnail(source_path: Path, cache_namespace: str) -> Path:
    """Returns a cached JPEG thumbnail path for source_path, generating it
    on first request. cache_namespace keeps raw/competitor/selected thumbs
    from colliding on filename."""
    key = hashlib.sha1(f"{cache_namespace}:{source_path}:{source_path.stat().st_mtime}".encode()).hexdigest()
    thumb_path = THUMBS_DIR / f"{key}.jpg"
    if thumb_path.exists():
        return thumb_path

    img = _load_upright(source_path)
    img.thumbnail((THUMB_MAX_DIM, THUMB_MAX_DIM), Image.LANCZOS)
    if img.mode != "RGB":
        img = img.convert("RGB")
    img.save(thumb_path, "JPEG", quality=82)
    return thumb_path


def prepare_image_for_vision(path: Path) -> Tuple[str, str]:
    """Returns (base64_data, media_type) for a downscaled JPEG suitable for
    an Anthropic vision request — keeps token cost and latency reasonable
    even for large camera-original files."""
    img = _load_upright(path)
    img.thumbnail((VISION_MAX_DIM, VISION_MAX_DIM), Image.LANCZOS)
    if img.mode != "RGB":
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    data = base64.standard_b64encode(buf.getvalue()).decode("utf-8")
    return data, "image/jpeg"
