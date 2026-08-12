#!/usr/bin/env python3
"""Download photos from a Dropbox shared folder into data/raw_photos/.

Authenticates against the Dropbox API using a refresh-token OAuth flow
(app key + app secret + long-lived refresh token -> short-lived access
token, refreshed automatically by the SDK on each run), then walks a
shared folder link and downloads every image it finds.

Setup:
    1. pip install -r requirements.txt
    2. Create a Dropbox app at https://www.dropbox.com/developers/apps
    3. Fill in DROPBOX_APP_KEY / DROPBOX_APP_SECRET in .env
    4. Run scripts/0_get_refresh_token.py once to obtain a refresh token
       and add it to .env as DROPBOX_REFRESH_TOKEN
    5. Set DROPBOX_SHARED_FOLDER_URL in .env to the shared folder link
    6. python scripts/1_fetch_photos.py

Usage:
    python scripts/1_fetch_photos.py
    python scripts/1_fetch_photos.py --url https://www.dropbox.com/scl/fo/... --out data/raw_photos
"""
from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

import dropbox
from dropbox.exceptions import ApiError, AuthError
from dropbox.files import FileMetadata, FolderMetadata
from dropbox.sharing import SharedLink
from dotenv import load_dotenv
import os

try:
    from tqdm import tqdm
except ImportError:  # tqdm is a soft dependency for progress display only
    tqdm = None

IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff",
    ".bmp", ".gif", ".webp", ".raw", ".cr2", ".cr3", ".nef", ".arw", ".dng",
}

MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("fetch_photos")


def build_client() -> dropbox.Dropbox:
    """Build an authenticated Dropbox client using the refresh-token flow."""
    app_key = os.environ.get("DROPBOX_APP_KEY")
    app_secret = os.environ.get("DROPBOX_APP_SECRET")
    refresh_token = os.environ.get("DROPBOX_REFRESH_TOKEN")

    missing = [
        name
        for name, value in (
            ("DROPBOX_APP_KEY", app_key),
            ("DROPBOX_APP_SECRET", app_secret),
            ("DROPBOX_REFRESH_TOKEN", refresh_token),
        )
        if not value
    ]
    if missing:
        log.error(
            "Missing required .env values: %s. "
            "Run scripts/0_get_refresh_token.py if you don't have a refresh token yet.",
            ", ".join(missing),
        )
        sys.exit(1)

    dbx = dropbox.Dropbox(
        oauth2_refresh_token=refresh_token,
        app_key=app_key,
        app_secret=app_secret,
    )

    try:
        dbx.users_get_current_account()
    except AuthError as exc:
        log.error("Dropbox authentication failed: %s", exc)
        sys.exit(1)

    return dbx


def list_shared_folder_images(dbx: dropbox.Dropbox, shared_url: str) -> list[FileMetadata]:
    """Recursively list image files inside a shared folder link."""
    shared_link = SharedLink(url=shared_url)
    entries: list[FileMetadata] = []

    result = dbx.files_list_folder(
        path="",
        shared_link=shared_link,
        recursive=True,
    )

    while True:
        for entry in result.entries:
            if isinstance(entry, FileMetadata):
                if Path(entry.name).suffix.lower() in IMAGE_EXTENSIONS:
                    entries.append(entry)
            elif isinstance(entry, FolderMetadata):
                continue  # directories are traversed automatically via recursive=True

        if not result.has_more:
            break
        result = dbx.files_list_folder_continue(result.cursor)

    return entries


def download_file(
    dbx: dropbox.Dropbox,
    shared_url: str,
    entry: FileMetadata,
    out_dir: Path,
) -> bool:
    """Download a single file from the shared folder, with basic retry logic."""
    relative_path = entry.path_display.lstrip("/") if entry.path_display else entry.name
    dest_path = out_dir / relative_path
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    if dest_path.exists() and dest_path.stat().st_size == entry.size:
        log.debug("Skipping already-downloaded file: %s", relative_path)
        return True

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            metadata, response = dbx.sharing_get_shared_link_file(
                url=shared_url,
                path=entry.path_lower,
            )
            dest_path.write_bytes(response.content)
            return True
        except (ApiError, Exception) as exc:  # noqa: BLE001 - retry on any transient error
            log.warning(
                "Attempt %d/%d failed for %s: %s",
                attempt, MAX_RETRIES, relative_path, exc,
            )
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SECONDS * attempt)

    log.error("Giving up on %s after %d attempts", relative_path, MAX_RETRIES)
    return False


def main() -> int:
    load_dotenv()

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url",
        default=os.environ.get("DROPBOX_SHARED_FOLDER_URL"),
        help="Dropbox shared folder link (defaults to DROPBOX_SHARED_FOLDER_URL in .env)",
    )
    parser.add_argument(
        "--out",
        default="data/raw_photos",
        help="Output directory for downloaded photos (default: data/raw_photos)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional cap on number of files to download (useful for testing)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List matching images without downloading them",
    )
    args = parser.parse_args()

    if not args.url:
        log.error(
            "No shared folder URL provided. Set DROPBOX_SHARED_FOLDER_URL in .env "
            "or pass --url."
        )
        return 1

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    dbx = build_client()

    log.info("Listing images in shared folder...")
    images = list_shared_folder_images(dbx, args.url)
    log.info("Found %d image(s).", len(images))

    if args.limit:
        images = images[: args.limit]

    if args.dry_run:
        for entry in images:
            print(entry.path_display)
        return 0

    iterator = tqdm(images, desc="Downloading", unit="file") if tqdm else images

    succeeded = 0
    failed = 0
    for entry in iterator:
        if download_file(dbx, args.url, entry, out_dir):
            succeeded += 1
        else:
            failed += 1

    log.info("Done. %d downloaded/verified, %d failed.", succeeded, failed)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
