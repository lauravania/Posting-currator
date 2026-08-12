"""
Central configuration: paths and environment loading for the wedding photo
curation app. Nothing here should require the user to hand-edit .env — the
Settings page reads/writes it via services.env_utils.
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"

# Make sure a .env file exists before we try to load/write it.
if not ENV_PATH.exists():
    ENV_PATH.write_text("")

load_dotenv(ENV_PATH)

# --- Data directories -------------------------------------------------
DATA_DIR = BASE_DIR / "data"
RAW_PHOTOS_DIR = DATA_DIR / "raw_photos"
COMPETITOR_DIR = DATA_DIR / "competitor_photos"
SELECTED_PHOTOS_DIR = DATA_DIR / "selected_photos"
THUMBS_DIR = DATA_DIR / ".thumbs"

CONFIG_DIR = BASE_DIR / "config"
OUTPUT_DIR = BASE_DIR / "output"

for d in (RAW_PHOTOS_DIR, COMPETITOR_DIR, SELECTED_PHOTOS_DIR, THUMBS_DIR, CONFIG_DIR, OUTPUT_DIR):
    d.mkdir(parents=True, exist_ok=True)

# --- Working / output files --------------------------------------------
COMPETITOR_CSV_PATH = DATA_DIR / "competitor_engagement.csv"
STYLE_PROFILE_PATH = CONFIG_DIR / "style_profile.json"
SCORES_PATH = DATA_DIR / "scores.json"
CAPTIONS_PATH = DATA_DIR / "captions.json"
RESULTS_PATH = OUTPUT_DIR / "results.json"

IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff",
    ".bmp", ".gif", ".webp",
}

# --- Flask secret key (auto-generated once, persisted to .env) --------
def ensure_flask_secret() -> str:
    key = os.environ.get("FLASK_SECRET_KEY")
    if key:
        return key
    # Local import to avoid a circular import at module load time.
    from services.env_utils import save_env_vars

    key = secrets.token_hex(32)
    save_env_vars({"FLASK_SECRET_KEY": key})
    return key


def dropbox_redirect_uri(base_url: str) -> str:
    return base_url.rstrip("/") + "/api/dropbox/oauth/callback"
