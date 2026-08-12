#!/usr/bin/env python3
"""
Download every photo from a Dropbox shared folder link into data/raw_photos/.

Authenticates to the Dropbox API using a refresh-token OAuth flow (no
interactive login required once DROPBOX_REFRESH_TOKEN is set in .env — see
scripts/0_get_refresh_token.py to generate one).

Usage:
    python scripts/1_fetch_photos.py
    python scripts/1_fetch_photos.py --link "https://www.dropbox.com/scl/fo/..." \
        --output-dir data/raw_photos --limit 200
"""
from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
import os

import dropbox
from dropbox.exceptions import ApiError, AuthError
from dropbox.files import FileMetadata, FolderMetadata, SharedLink
from tqdm import tqdm

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("fetch_photos")

IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff",
    ".bmp", ".gif", ".webp",
    # common RAW formats from cameras
    ".raw", ".cr2", ".cr3", ".nef", ".arw", ".dng", ".orf", ".rw2",
}

MAX_RETRIES = 5


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--link",
        default=os.environ.get("DROPBOX_SHARED_FOLDER_LINK"),
        help="Dropbox shared folder link (defaults to DROPBOX_SHARED_FOLDER_LINK in .env)",
    )
    parser.add_argument(
        "--output-dir",
        default="data/raw_photos",
        help="Directory to save downloaded photos into (default: data/raw_photos)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of photos to download (default: no limit)",
    )
    parser.add_argument(
        "--no-recursive",
        action="store_true",
        help="Only download photos in the top level of the shared folder",
    )
    parser.add_argument(
        "--all-files",
        action="store_true",
        help="Download every file, not just recognized image/RAW extensions",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Re-download files even if a same-named file already exists locally",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List what would be downloaded without actually downloading",
    )
    return parser.parse_args()


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
        if not value or value.startswith("your_")
    ]
    if missing:
        logger.error(
            "Missing/unset %s in .env. Copy .env.example to .env and fill "
            "them in (run scripts/0_get_refresh_token.py to get a refresh token).",
            ", ".join(missing),
        )
        sys.exit(1)

    dbx = dropbox.Dropbox(
        app_key=app_key,
        app_secret=app_secret,
        oauth2_refresh_token=refresh_token,
    )
    try:
        account = dbx.users_get_current_account()
        logger.info("Authenticated to Dropbox as %s", account.email)
    except AuthError as exc:
        logger.error("Dropbox authentication failed: %s", exc)
        sys.exit(1)

    return dbx


def list_shared_folder_files(
    dbx: dropbox.Dropbox, link: str, recursive: bool
) -> list[FileMetadata]:
    """Return metadata for every file inside a Dropbox shared folder link."""
    shared_link = SharedLink(url=link)
    entries: list[FileMetadata] = []

    try:
        result = dbx.files_list_folder(
            path="", shared_link=shared_link, recursive=recursive
        )
    except ApiError as exc:
        logger.error("Could not list shared folder contents: %s", exc)
        sys.exit(1)

    while True:
        for entry in result.entries:
            if isinstance(entry, FileMetadata):
                entries.append(entry)
        if not result.has_more:
            break
        result = dbx.files_list_folder_continue(result.cursor)

    return entries


def is_image(name: str) -> bool:
    return Path(name).suffix.lower() in IMAGE_EXTENSIONS


def safe_local_path(output_dir: Path, dropbox_path: str) -> Path:
    """
    Flatten a Dropbox path (which may include subfolders when recursive)
    into a single filename inside output_dir, avoiding collisions.
    """
    relative = dropbox_path.lstrip("/")
    flat_name = relative.replace("/", "__")
    return output_dir / flat_name


def download_with_retry(
    dbx: dropbox.Dropbox, link: str, dropbox_path: str, dest: Path
) -> bool:
    """Download one file from a shared folder link, retrying on transient errors."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            metadata, response = dbx.sharing_get_shared_link_file(
                url=link, path=dropbox_path
            )
            dest.write_bytes(response.content)
            return True
        except ApiError as exc:
            logger.error("Dropbox API error on %s: %s", dropbox_path, exc)
            return False
        except Exception as exc:  # noqa: BLE001 - network hiccups, rate limits, etc.
            wait = 2 ** attempt
            logger.warning(
                "Error downloading %s (attempt %d/%d): %s — retrying in %ds",
                dropbox_path, attempt, MAX_RETRIES, exc, wait,
            )
            time.sleep(wait)
    logger.error("Giving up on %s after %d attempts", dropbox_path, MAX_RETRIES)
    return False


def main() -> int:
    load_dotenv()
    args = parse_args()

    if not args.link:
        logger.error(
            "No shared folder link given. Pass --link or set "
            "DROPBOX_SHARED_FOLDER_LINK in .env."
        )
        return 1

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    dbx = build_client()

    logger.info("Listing files in shared folder...")
    all_files = list_shared_folder_files(dbx, args.link, recursive=not args.no_recursive)
    logger.info("Found %d file(s) total", len(all_files))

    files = all_files if args.all_files else [f for f in all_files if is_image(f.name)]
    logger.info("%d file(s) match the image filter", len(files))

    if args.limit is not None:
        files = files[: args.limit]

    if not files:
        logger.info("Nothing to download.")
        return 0

    downloaded, skipped, failed = 0, 0, 0

    for entry in tqdm(files, desc="Downloading photos", unit="photo"):
        dropbox_path = entry.path_lower or f"/{entry.name}"
        dest = safe_local_path(output_dir, dropbox_path)

        if dest.exists() and not args.overwrite:
            skipped += 1
            continue

        if args.dry_run:
            logger.info("[dry-run] would download %s -> %s", dropbox_path, dest)
            continue

        if download_with_retry(dbx, args.link, dropbox_path, dest):
            downloaded += 1
        else:
            failed += 1

    logger.info(
        "Done. Downloaded: %d, Skipped (already present): %d, Failed: %d",
        downloaded, skipped, failed,
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
