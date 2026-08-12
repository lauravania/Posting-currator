"""
Read/write credentials to the local .env file on the user's behalf, so the
Settings page is the only place secrets ever get typed. Never log secret
values.
"""
from __future__ import annotations

import os
from typing import Dict

from dotenv import set_key, unset_key

from config import ENV_PATH

# Fields the Settings page is allowed to write. Keeping an explicit allowlist
# means a stray form field can never clobber an unrelated .env entry.
SETTABLE_KEYS = {
    "DROPBOX_APP_KEY",
    "DROPBOX_APP_SECRET",
    "DROPBOX_REFRESH_TOKEN",
    "DROPBOX_SHARED_FOLDER_LINK",
    "ANTHROPIC_API_KEY",
    "FLASK_SECRET_KEY",
}

SECRET_KEYS = {"DROPBOX_APP_SECRET", "DROPBOX_REFRESH_TOKEN", "ANTHROPIC_API_KEY", "FLASK_SECRET_KEY"}


def save_env_vars(values: Dict[str, str]) -> None:
    """Persist values to .env and update the current process's environment."""
    for key, value in values.items():
        if key not in SETTABLE_KEYS:
            continue
        value = (value or "").strip()
        if value == "":
            unset_key(str(ENV_PATH), key)
            os.environ.pop(key, None)
            continue
        set_key(str(ENV_PATH), key, value)
        os.environ[key] = value


def mask_secret(value: str | None) -> str:
    if not value:
        return ""
    value = value.strip()
    if len(value) <= 8:
        return "•" * len(value)
    return f"{value[:4]}{'•' * 6}{value[-4:]}"


def get_settings_status() -> dict:
    """What the Settings page needs to render current state without ever
    exposing full secret values back to the browser."""
    app_key = os.environ.get("DROPBOX_APP_KEY", "")
    app_secret = os.environ.get("DROPBOX_APP_SECRET", "")
    refresh_token = os.environ.get("DROPBOX_REFRESH_TOKEN", "")
    shared_link = os.environ.get("DROPBOX_SHARED_FOLDER_LINK", "")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")

    return {
        "dropbox_app_key": app_key,
        "dropbox_app_key_set": bool(app_key),
        "dropbox_app_secret_set": bool(app_secret),
        "dropbox_app_secret_masked": mask_secret(app_secret),
        "dropbox_connected": bool(refresh_token),
        "dropbox_shared_folder_link": shared_link,
        "anthropic_key_set": bool(anthropic_key),
        "anthropic_key_masked": mask_secret(anthropic_key),
    }
