#!/usr/bin/env python3
"""
1_fetch_photos.py
==================

First step of the wedding photo curation pipeline.

Downloads every image found in a Dropbox *shared folder* link into
``data/raw_photos/``, authenticating with the Dropbox API via a
long-lived OAuth2 refresh token (no browser login required at run time).

Setup
-----
1. Create a Dropbox app at https://www.dropbox.com/developers/apps
   (Scoped access, permissions: ``sharing.read`` and ``files.content.read``).
2. Generate a refresh token for that app (one-time OAuth2 code flow):

   a. Visit, in a browser, replacing <APP_KEY>::

        https://www.dropbox.com/oauth2/authorize?client_id=<APP_KEY>&token_access_type=offline&response_type=code

   b. Approve access and copy the authorization code shown.
   c. Exchange it for a refresh token::

        curl https://api.dropboxapi.com/oauth2/token \\
            -d code=<AUTH_CODE> \\
            -d grant_type=authorization_code \\
            -d client_id=<APP_KEY> \\
            -d client_secret=<APP_SECRET>

      The JSON response contains ``refresh_token``.
3. Copy ``.env.example`` to ``.env`` and fill in ``DROPBOX_APP_KEY``,
   ``DROPBOX_APP_SECRET``, ``DROPBOX_REFRESH_TOKEN`` and
   ``DROPBOX_SHARED_LINK``.

Usage
-----
    python scripts/1_fetch_photos.py
    python scripts/1_fetch_photos.py --shared-link "https://www.dropbox.com/scl/fo/..."
    python scripts/1_fetch_photos.py --output-dir data/raw_photos --limit 50
    python scripts/1_fetch_photos.py --dry-run
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path

import dropbox
from dropbox.exceptions import ApiError, AuthError
from dotenv import load_dotenv
from tqdm import tqdm

# Image (incl. common RAW) extensions we consider "photos".
IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff",
    ".bmp", ".gif", ".webp",
    ".raw", ".cr2", ".cr3", ".nef", ".arw", ".dng", ".orf", ".rw2",
}

DEFAULT_OUTPUT_DIR = Path("data/raw_photos")
MAX_DOWNLOAD_RETRIES = 3

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("fetch_photos")


def build_client(app_key: str, app_secret: str, refresh_token: str) -> dropbox.Dropbox:
    """Build a Dropbox client that auto-refreshes its access token."""
    dbx = dropbox.Dropbox(
        oauth2_refresh_token=refresh_token,
        app_key=app_key,
        app_secret=app_secret,
    )
    try:
        dbx.users_get_current_account()
    except AuthError as exc:
        log.error("Dropbox authentication failed: %s", exc)
        raise SystemExit(1) from exc
    return dbx


def list_shared_folder_images(dbx: dropbox.Dropbox, shared_link: str, recursive: bool = True):
    """Yield FileMetadata entries for every image found under a shared folder link."""
    link = dropbox.files.SharedLink(url=shared_link)

    try:
        result = dbx.files_list_folder(path="", shared_link=link, recursive=recursive)
    except ApiError as exc:
        log.error("Could not list shared folder %s: %s", shared_link, exc)
        raise SystemExit(1) from exc

    while True:
        for entry in result.entries:
            if isinstance(entry, dropbox.files.FileMetadata):
                ext = Path(entry.name).suffix.lower()
                if ext in IMAGE_EXTENSIONS:
                    yield entry

        if not result.has_more:
            break
        result = dbx.files_list_folder_continue(result.cursor)


def download_file(dbx: dropbox.Dropbox, shared_link: str, entry, dest_dir: Path) -> bool:
    """Download a single shared-link file entry to dest_dir. Returns True on success."""
    rel_path = entry.path_lower or f"/{entry.name}"
    dest_path = dest_dir / entry.name

    # Skip files we already have with a matching size (idempotent re-runs).
    if dest_path.exists() and dest_path.stat().st_size == entry.size:
        return True

    for attempt in range(1, MAX_DOWNLOAD_RETRIES + 1):
        try:
            _, response = dbx.sharing_get_shared_link_file(url=shared_link, path=rel_path)
            dest_path.write_bytes(response.content)
            return True
        except (ApiError, Exception) as exc:  # noqa: BLE001 - broad: network/API errors, retry
            log.warning(
                "Attempt %d/%d failed for %s: %s",
                attempt, MAX_DOWNLOAD_RETRIES, entry.name, exc,
            )
            if attempt < MAX_DOWNLOAD_RETRIES:
                time.sleep(2 * attempt)
    log.error("Giving up on %s after %d attempts", entry.name, MAX_DOWNLOAD_RETRIES)
    return False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--shared-link",
        default=None,
        help="Dropbox shared folder link (defaults to DROPBOX_SHARED_LINK from .env)",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help=f"Directory to save photos to (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only download the first N images (useful for testing)",
    )
    parser.add_argument(
        "--no-recursive",
        action="store_true",
        help="Do not descend into subfolders of the shared folder",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List what would be downloaded without writing any files",
    )
    return parser.parse_args()


def main() -> None:
    load_dotenv()
    args = parse_args()

    app_key = os.getenv("DROPBOX_APP_KEY")
    app_secret = os.getenv("DROPBOX_APP_SECRET")
    refresh_token = os.getenv("DROPBOX_REFRESH_TOKEN")
    shared_link = args.shared_link or os.getenv("DROPBOX_SHARED_LINK")

    missing = [
        name for name, val in (
            ("DROPBOX_APP_KEY", app_key),
            ("DROPBOX_APP_SECRET", app_secret),
            ("DROPBOX_REFRESH_TOKEN", refresh_token),
            ("DROPBOX_SHARED_LINK", shared_link),
        )
        if not val or val.startswith("your_")
    ]
    if missing:
        log.error(
            "Missing/unset required credentials: %s\n"
            "Copy .env.example to .env and fill in real values, "
            "or pass --shared-link explicitly.",
            ", ".join(missing),
        )
        sys.exit(1)

    output_dir = Path(args.output_dir) if args.output_dir else DEFAULT_OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    log.info("Connecting to Dropbox...")
    dbx = build_client(app_key, app_secret, refresh_token)

    log.info("Listing images in shared folder...")
    entries = list(list_shared_folder_images(dbx, shared_link, recursive=not args.no_recursive))
    log.info("Found %d image(s).", len(entries))

    if args.limit:
        entries = entries[: args.limit]

    if args.dry_run:
        for entry in entries:
            print(entry.path_lower or entry.name)
        log.info("Dry run complete. %d file(s) would be downloaded to %s", len(entries), output_dir)
        return

    successes, failures = 0, 0
    for entry in tqdm(entries, desc="Downloading", unit="photo"):
        if download_file(dbx, shared_link, entry, output_dir):
            successes += 1
        else:
            failures += 1

    log.info("Done. %d downloaded, %d failed. Saved to %s", successes, failures, output_dir)
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
