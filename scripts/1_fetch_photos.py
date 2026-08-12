#!/usr/bin/env python3
"""
1_fetch_photos.py

Downloads every photo from a Dropbox *shared folder* link into
`data/raw_photos/`, authenticating against the Dropbox API with a
long-lived refresh token (so this can run unattended, without a browser
prompt, once the refresh token has been generated).

Setup
-----
1. Create a Dropbox app at https://www.dropbox.com/developers/apps
   (Scoped access, with the `files.metadata.read`, `files.content.read`
   and `sharing.read` permissions checked).
2. Generate a refresh token for that app (see README.md for the one-time
   OAuth steps).
3. Copy `.env.example` to `.env` and fill in:
     DROPBOX_APP_KEY
     DROPBOX_APP_SECRET
     DROPBOX_REFRESH_TOKEN
     DROPBOX_SHARED_LINK
4. Run:  python scripts/1_fetch_photos.py

Usage
-----
    python scripts/1_fetch_photos.py
    python scripts/1_fetch_photos.py --link "https://www.dropbox.com/scl/fo/..." \
        --output-dir data/raw_photos --no-recursive
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import dropbox
from dropbox.exceptions import ApiError, AuthError
from dropbox.files import FileMetadata, FolderMetadata, SharedLink
from dotenv import load_dotenv

try:
    from tqdm import tqdm
except ImportError:  # tqdm is a soft dependency for the progress bar
    def tqdm(iterable, **kwargs):
        return iterable


IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".tiff", ".tif",
    ".bmp", ".gif", ".webp", ".raw", ".cr2", ".nef", ".arw", ".dng",
}

MAX_RETRIES = 5
RETRY_BACKOFF_SECONDS = 2


def build_client() -> dropbox.Dropbox:
    """Authenticate with Dropbox using the refresh-token OAuth flow."""
    app_key = os.environ.get("DROPBOX_APP_KEY")
    app_secret = os.environ.get("DROPBOX_APP_SECRET")
    refresh_token = os.environ.get("DROPBOX_REFRESH_TOKEN")

    missing = [
        name
        for name, value in [
            ("DROPBOX_APP_KEY", app_key),
            ("DROPBOX_APP_SECRET", app_secret),
            ("DROPBOX_REFRESH_TOKEN", refresh_token),
        ]
        if not value
    ]
    if missing:
        sys.exit(
            "Missing required environment variable(s): "
            f"{', '.join(missing)}.\n"
            "Copy .env.example to .env and fill in your Dropbox app "
            "credentials before running this script."
        )

    dbx = dropbox.Dropbox(
        oauth2_refresh_token=refresh_token,
        app_key=app_key,
        app_secret=app_secret,
    )

    try:
        dbx.users_get_current_account()
    except AuthError as exc:
        sys.exit(f"Dropbox authentication failed: {exc}")

    return dbx


def iter_shared_folder_entries(dbx: dropbox.Dropbox, shared_link: str, recursive: bool):
    """Yield FileMetadata entries found inside a Dropbox shared folder link."""
    shared_link_arg = SharedLink(url=shared_link)

    result = _with_retries(
        lambda: dbx.files_list_folder(
            path="",
            shared_link=shared_link_arg,
            recursive=recursive,
        )
    )

    while True:
        for entry in result.entries:
            if isinstance(entry, FileMetadata):
                yield entry
            # FolderMetadata entries are only relevant when recursive=False
            # and are simply skipped (their contents aren't listed).
        if not result.has_more:
            break
        result = _with_retries(lambda: dbx.files_list_folder_continue(result.cursor))


def _with_retries(call):
    """Run a Dropbox API call, retrying on rate limits / transient errors."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return call()
        except ApiError as exc:
            error = exc.error
            if hasattr(error, "is_retry_error") and error.is_retry_error():
                wait = RETRY_BACKOFF_SECONDS * attempt
                print(f"  Rate limited/retryable error, waiting {wait}s...")
                time.sleep(wait)
                continue
            raise
        except Exception as exc:  # network errors, etc.
            if attempt == MAX_RETRIES:
                raise
            wait = RETRY_BACKOFF_SECONDS * attempt
            print(f"  Error ({exc}), retrying in {wait}s... [{attempt}/{MAX_RETRIES}]")
            time.sleep(wait)
    raise RuntimeError("Exceeded max retries")


def download_entry(
    dbx: dropbox.Dropbox,
    shared_link: str,
    entry: FileMetadata,
    output_dir: Path,
) -> Path:
    """Download a single shared-folder file to output_dir, preserving its
    relative sub-path so images in nested folders don't collide."""
    relative_path = entry.path_display.lstrip("/")
    dest_path = output_dir / relative_path
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    if dest_path.exists() and dest_path.stat().st_size == entry.size:
        return dest_path  # already downloaded, skip

    def _do_download():
        return dbx.sharing_get_shared_link_file(url=shared_link, path=entry.path_lower)

    _, response = _with_retries(_do_download)
    dest_path.write_bytes(response.content)
    return dest_path


def main():
    parser = argparse.ArgumentParser(
        description="Download photos from a Dropbox shared folder link."
    )
    parser.add_argument(
        "--link",
        default=None,
        help="Dropbox shared folder link (defaults to DROPBOX_SHARED_LINK from .env)",
    )
    parser.add_argument(
        "--output-dir",
        default="data/raw_photos",
        help="Directory to save downloaded photos into (default: data/raw_photos)",
    )
    parser.add_argument(
        "--no-recursive",
        action="store_true",
        help="Only fetch files in the top-level of the shared folder (skip subfolders)",
    )
    args = parser.parse_args()

    load_dotenv()

    shared_link = args.link or os.environ.get("DROPBOX_SHARED_LINK")
    if not shared_link:
        sys.exit(
            "No shared folder link provided. Pass --link or set "
            "DROPBOX_SHARED_LINK in your .env file."
        )

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    dbx = build_client()

    print(f"Listing files in shared folder: {shared_link}")
    entries = list(iter_shared_folder_entries(dbx, shared_link, recursive=not args.no_recursive))

    photo_entries = [
        e for e in entries if Path(e.name).suffix.lower() in IMAGE_EXTENSIONS
    ]
    skipped = len(entries) - len(photo_entries)
    print(f"Found {len(entries)} file(s); {len(photo_entries)} look like photos"
          + (f" ({skipped} non-image file(s) skipped)" if skipped else "") + ".")

    if not photo_entries:
        print("No photos to download.")
        return

    downloaded = 0
    for entry in tqdm(photo_entries, desc="Downloading photos", unit="photo"):
        try:
            download_entry(dbx, shared_link, entry, output_dir)
            downloaded += 1
        except Exception as exc:
            print(f"  Failed to download {entry.path_display}: {exc}")

    print(f"Done. {downloaded}/{len(photo_entries)} photo(s) saved to {output_dir}/")


if __name__ == "__main__":
    main()
