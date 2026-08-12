#!/usr/bin/env python3
"""
1_fetch_photos.py

Downloads every image in a Dropbox *shared folder* link into data/raw_photos/,
authenticating via a long-lived refresh token (no manual re-login required).

Setup:
    1. Create a Dropbox app at https://www.dropbox.com/developers/apps
       (scoped access, with files.metadata.read / files.content.read /
       sharing.read permissions enabled).
    2. Obtain a refresh token once (see README.md "Getting a refresh token").
    3. Copy .env.example to .env and fill in:
         DROPBOX_APP_KEY
         DROPBOX_APP_SECRET
         DROPBOX_REFRESH_TOKEN
         DROPBOX_SHARED_LINK
    4. pip install -r requirements.txt
    5. python scripts/1_fetch_photos.py

Usage:
    python scripts/1_fetch_photos.py
    python scripts/1_fetch_photos.py --link "https://www.dropbox.com/scl/fo/..." \
        --out data/raw_photos --recursive
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

import dropbox
from dropbox.exceptions import ApiError, AuthError
from dropbox.files import FileMetadata, FolderMetadata, SharedLink
from dotenv import load_dotenv

try:
    from tqdm import tqdm
except ImportError:  # tqdm is a nice-to-have, not a hard requirement
    tqdm = None

IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff",
    ".bmp", ".gif", ".webp", ".raw", ".cr2", ".nef", ".arw", ".dng",
}

DEFAULT_OUTPUT_DIR = Path("data/raw_photos")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("fetch_photos")


def build_client() -> dropbox.Dropbox:
    """Create a Dropbox client that auto-refreshes its access token."""
    app_key = os.environ.get("DROPBOX_APP_KEY")
    app_secret = os.environ.get("DROPBOX_APP_SECRET")
    refresh_token = os.environ.get("DROPBOX_REFRESH_TOKEN")

    missing = [
        name
        for name, val in [
            ("DROPBOX_APP_KEY", app_key),
            ("DROPBOX_APP_SECRET", app_secret),
            ("DROPBOX_REFRESH_TOKEN", refresh_token),
        ]
        if not val or val.startswith("your_")
    ]
    if missing:
        log.error(
            "Missing/placeholder Dropbox credentials in .env: %s. "
            "See .env.example for setup instructions.",
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


def is_image(filename: str) -> bool:
    return Path(filename).suffix.lower() in IMAGE_EXTENSIONS


def iter_shared_folder_files(dbx: dropbox.Dropbox, shared_link: str, recursive: bool):
    """Yield FileMetadata for every file inside a shared folder link."""
    link = SharedLink(url=shared_link)

    result = dbx.files_list_folder(path="", shared_link=link, recursive=recursive)
    while True:
        for entry in result.entries:
            if isinstance(entry, FileMetadata):
                yield entry
            elif isinstance(entry, FolderMetadata) and not recursive:
                log.debug("Skipping subfolder (use --recursive to include): %s", entry.path_display)
        if not result.has_more:
            break
        result = dbx.files_list_folder_continue(result.cursor)


def download_file(dbx: dropbox.Dropbox, shared_link: str, entry: FileMetadata, out_dir: Path) -> bool:
    """Download a single shared-folder file to out_dir. Returns True if downloaded."""
    dest = out_dir / entry.name

    if dest.exists() and dest.stat().st_size == entry.size:
        log.debug("Already downloaded, skipping: %s", entry.name)
        return False

    link = SharedLink(url=shared_link)
    try:
        metadata, response = dbx.sharing_get_shared_link_file(
            url=shared_link, path=entry.path_lower
        )
        dest.write_bytes(response.content)
    except ApiError as exc:
        log.warning("Failed to download %s: %s", entry.name, exc)
        return False

    return True


def fetch_photos(shared_link: str, out_dir: Path, recursive: bool = False) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    dbx = build_client()

    log.info("Listing files in shared folder...")
    try:
        all_entries = list(iter_shared_folder_files(dbx, shared_link, recursive))
    except ApiError as exc:
        log.error("Failed to list shared folder contents: %s", exc)
        sys.exit(1)

    image_entries = [e for e in all_entries if is_image(e.name)]
    log.info(
        "Found %d files in shared folder, %d are images.",
        len(all_entries),
        len(image_entries),
    )

    if not image_entries:
        log.warning("No images found — nothing to download.")
        return

    iterator = image_entries
    if tqdm is not None:
        iterator = tqdm(image_entries, desc="Downloading photos", unit="file")

    downloaded = 0
    skipped = 0
    failed = 0
    for entry in iterator:
        try:
            if download_file(dbx, shared_link, entry, out_dir):
                downloaded += 1
            else:
                skipped += 1
        except Exception as exc:  # keep going even if one file errors out
            log.warning("Error downloading %s: %s", entry.name, exc)
            failed += 1

    log.info(
        "Done. Downloaded: %d, already present: %d, failed: %d. Output dir: %s",
        downloaded,
        skipped,
        failed,
        out_dir.resolve(),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--link",
        default=None,
        help="Dropbox shared folder link (defaults to DROPBOX_SHARED_LINK from .env)",
    )
    parser.add_argument(
        "--out",
        default=str(DEFAULT_OUTPUT_DIR),
        help=f"Output directory for downloaded photos (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Also descend into subfolders of the shared folder",
    )
    return parser.parse_args()


def main() -> None:
    load_dotenv()
    args = parse_args()

    shared_link = args.link or os.environ.get("DROPBOX_SHARED_LINK")
    if not shared_link or shared_link.startswith("https://www.dropbox.com/scl/fo/your_shared"):
        log.error(
            "No shared folder link provided. Pass --link or set DROPBOX_SHARED_LINK in .env."
        )
        sys.exit(1)

    fetch_photos(shared_link, Path(args.out), recursive=args.recursive)


if __name__ == "__main__":
    main()
