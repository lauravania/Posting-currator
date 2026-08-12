"""
Dropbox integration: refresh-token OAuth flow (so the user only ever clicks
"Connect Dropbox" once) and paginated photo download from a shared folder
link into data/raw_photos/.
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Iterable

import dropbox
from dropbox import DropboxOAuth2Flow
from dropbox.exceptions import ApiError, AuthError
from dropbox.files import FileMetadata, SharedLink

from config import IMAGE_EXTENSIONS, RAW_PHOTOS_DIR
from services.env_utils import save_env_vars
from services.jobs import Job

CSRF_SESSION_KEY = "dropbox-auth-csrf-token"
MAX_RETRIES = 4


class DropboxConfigError(Exception):
    """Raised when required Dropbox credentials are missing."""


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise DropboxConfigError(f"{name} is not set. Save it on the Settings page first.")
    return value


# --- OAuth (authorization-code + refresh-token flow) --------------------

def get_oauth_flow(session, redirect_uri: str) -> DropboxOAuth2Flow:
    app_key = _require("DROPBOX_APP_KEY")
    app_secret = _require("DROPBOX_APP_SECRET")
    return DropboxOAuth2Flow(
        consumer_key=app_key,
        consumer_secret=app_secret,
        redirect_uri=redirect_uri,
        session=session,
        csrf_token_session_key=CSRF_SESSION_KEY,
        token_access_type="offline",
    )


def start_oauth(session, redirect_uri: str) -> str:
    """Returns the Dropbox authorize URL the frontend should open."""
    flow = get_oauth_flow(session, redirect_uri)
    return flow.start()


def finish_oauth(session, redirect_uri: str, query_params) -> str:
    """Completes the OAuth flow, saves the refresh token to .env, and
    returns it."""
    flow = get_oauth_flow(session, redirect_uri)
    result = flow.finish(query_params)
    if not result.refresh_token:
        raise DropboxConfigError(
            "Dropbox did not return a refresh token. Make sure the app is "
            "configured for offline access and try connecting again."
        )
    save_env_vars({"DROPBOX_REFRESH_TOKEN": result.refresh_token})
    return result.refresh_token


# --- API client -----------------------------------------------------------

def build_client() -> dropbox.Dropbox:
    app_key = _require("DROPBOX_APP_KEY")
    app_secret = _require("DROPBOX_APP_SECRET")
    refresh_token = _require("DROPBOX_REFRESH_TOKEN")

    dbx = dropbox.Dropbox(
        app_key=app_key,
        app_secret=app_secret,
        oauth2_refresh_token=refresh_token,
    )
    try:
        dbx.users_get_current_account()
    except AuthError as exc:
        raise DropboxConfigError(f"Dropbox authentication failed: {exc}") from exc
    return dbx


def is_image(name: str) -> bool:
    return Path(name).suffix.lower() in IMAGE_EXTENSIONS


def list_shared_folder_files(dbx: dropbox.Dropbox, link: str) -> Iterable[FileMetadata]:
    """Yields FileMetadata for every file in a Dropbox shared folder link,
    following pagination (files_list_folder_continue) until exhausted."""
    shared_link = SharedLink(url=link)
    result = dbx.files_list_folder(path="", shared_link=shared_link, recursive=True)
    while True:
        for entry in result.entries:
            if isinstance(entry, FileMetadata):
                yield entry
        if not result.has_more:
            break
        result = dbx.files_list_folder_continue(result.cursor)


def _safe_local_path(dropbox_path: str) -> Path:
    relative = dropbox_path.lstrip("/")
    flat_name = relative.replace("/", "__")
    return RAW_PHOTOS_DIR / flat_name


def _download_with_retry(dbx: dropbox.Dropbox, link: str, dropbox_path: str, dest: Path) -> None:
    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            _metadata, response = dbx.sharing_get_shared_link_file(url=link, path=dropbox_path)
            dest.write_bytes(response.content)
            return
        except ApiError:
            raise
        except Exception as exc:  # noqa: BLE001 - network hiccups / rate limits
            last_exc = exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed to download {dropbox_path} after {MAX_RETRIES} attempts: {last_exc}")


def fetch_photos(job: Job) -> None:
    """Job entry point: downloads every image from the configured Dropbox
    shared folder link into data/raw_photos/, skipping files already
    present locally and reporting live progress."""
    link = _require("DROPBOX_SHARED_FOLDER_LINK")
    dbx = build_client()

    job.set_progress(phase="listing", message="Listing files in the shared folder...")
    all_files = list(list_shared_folder_files(dbx, link))
    image_files = [f for f in all_files if is_image(f.name)]

    total = len(image_files)
    job.set_progress(
        phase="downloading",
        total=total,
        downloaded=0,
        skipped=0,
        failed=0,
        failed_files=[],
        recent=[],
        message=f"Found {total} image(s). Downloading...",
    )

    downloaded = skipped = failed = 0
    failed_files: list[str] = []
    recent: list[str] = []

    for entry in image_files:
        dropbox_path = entry.path_lower or f"/{entry.name}"
        dest = _safe_local_path(dropbox_path)

        if dest.exists() and dest.stat().st_size == entry.size:
            skipped += 1
        else:
            try:
                _download_with_retry(dbx, link, dropbox_path, dest)
                downloaded += 1
                recent.append(dest.name)
                recent = recent[-12:]
            except Exception as exc:  # noqa: BLE001
                failed += 1
                failed_files.append(f"{entry.name}: {exc}")

        job.set_progress(
            downloaded=downloaded,
            skipped=skipped,
            failed=failed,
            failed_files=failed_files[-20:],
            recent=recent,
            message=f"{downloaded + skipped + failed}/{total} processed",
        )

    job.set_progress(
        phase="done",
        message=f"Done. Downloaded {downloaded}, skipped {skipped} already-present, {failed} failed.",
    )
