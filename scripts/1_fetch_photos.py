"""
Download all photos from a Dropbox shared folder link into data/raw_photos/.

Authenticates using a long-lived refresh token (no manual re-auth needed),
exchanged for short-lived access tokens automatically by the Dropbox SDK.

Setup:
    1. Copy .env.example to .env and fill in DROPBOX_APP_KEY / DROPBOX_APP_SECRET.
    2. Run `python scripts/get_refresh_token.py` once to obtain
       DROPBOX_REFRESH_TOKEN and add it to .env.
    3. Set DROPBOX_SHARED_LINK in .env to the shared folder URL.

Usage:
    python scripts/1_fetch_photos.py
    python scripts/1_fetch_photos.py --shared-link "https://www.dropbox.com/scl/fo/..."
    python scripts/1_fetch_photos.py --output-dir data/raw_photos --limit 20
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
from dropbox.files import FileMetadata, FolderMetadata
from dotenv import load_dotenv

try:
    from tqdm import tqdm
except ImportError:  # tqdm is a nice-to-have, not required
    def tqdm(iterable, **kwargs):  # type: ignore[no-redef]
        return iterable

IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff",
    ".bmp", ".gif", ".webp", ".raw", ".cr2", ".nef", ".arw",
}

DEFAULT_OUTPUT_DIR = Path("data/raw_photos")
MAX_RETRIES = 5

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def build_client() -> dropbox.Dropbox:
    """Create an authenticated Dropbox client using a refresh token."""
    app_key = os.environ.get("DROPBOX_APP_KEY")
    app_secret = os.environ.get("DROPBOX_APP_SECRET")
    refresh_token = os.environ.get("DROPBOX_REFRESH_TOKEN")

    missing = [
        name
        for name, val in (
            ("DROPBOX_APP_KEY", app_key),
            ("DROPBOX_APP_SECRET", app_secret),
            ("DROPBOX_REFRESH_TOKEN", refresh_token),
        )
        if not val
    ]
    if missing:
        sys.exit(
            "Missing required environment variable(s): "
            f"{', '.join(missing)}.\n"
            "Copy .env.example to .env and fill them in (see README.md). "
            "Run scripts/get_refresh_token.py to generate a refresh token."
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


def list_shared_folder_files(dbx: dropbox.Dropbox, shared_link: str) -> list[FileMetadata]:
    """Recursively list every file entry inside a Dropbox shared folder link."""
    link = dropbox.files.SharedLink(url=shared_link)
    files: list[FileMetadata] = []

    def walk(path: str) -> None:
        try:
            result = dbx.files_list_folder(path=path, shared_link=link)
        except ApiError as exc:
            logger.error("Failed to list folder %r: %s", path or "/", exc)
            return

        entries = list(result.entries)
        while result.has_more:
            result = dbx.files_list_folder_continue(result.cursor)
            entries.extend(result.entries)

        for entry in entries:
            if isinstance(entry, FileMetadata):
                files.append(entry)
            elif isinstance(entry, FolderMetadata):
                walk(entry.path_lower)

    walk("")
    return files


def is_image(name: str) -> bool:
    return Path(name).suffix.lower() in IMAGE_EXTENSIONS


def download_file(
    dbx: dropbox.Dropbox,
    shared_link: str,
    entry: FileMetadata,
    dest_path: Path,
) -> bool:
    """Download one file from the shared link, retrying on transient errors."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            _, response = dbx.sharing_get_shared_link_file(
                url=shared_link, path=entry.path_lower
            )
            dest_path.write_bytes(response.content)
            return True
        except ApiError as exc:
            logger.warning("API error downloading %s (attempt %d/%d): %s",
                            entry.name, attempt, MAX_RETRIES, exc)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Error downloading %s (attempt %d/%d): %s",
                            entry.name, attempt, MAX_RETRIES, exc)

        if attempt < MAX_RETRIES:
            time.sleep(2 ** attempt)

    logger.error("Giving up on %s after %d attempts", entry.name, MAX_RETRIES)
    return False


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--shared-link",
        default=os.environ.get("DROPBOX_SHARED_LINK"),
        help="Dropbox shared folder URL (defaults to DROPBOX_SHARED_LINK in .env)",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help=f"Directory to save photos to (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Only download the first N images (useful for testing)",
    )
    parser.add_argument(
        "--overwrite", action="store_true",
        help="Re-download files that already exist locally (default: skip them)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="List matching images without downloading anything",
    )
    args = parser.parse_args()

    if not args.shared_link:
        sys.exit(
            "No shared link provided. Set DROPBOX_SHARED_LINK in .env or pass --shared-link."
        )

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    dbx = build_client()

    logger.info("Listing files in shared folder...")
    all_files = list_shared_folder_files(dbx, args.shared_link)
    image_files = [f for f in all_files if is_image(f.name)]
    logger.info("Found %d file(s), %d of which are images.", len(all_files), len(image_files))

    if args.limit is not None:
        image_files = image_files[: args.limit]

    if args.dry_run:
        for entry in image_files:
            print(entry.path_display or entry.name)
        logger.info("Dry run: %d image(s) would be downloaded.", len(image_files))
        return

    downloaded, skipped, failed = 0, 0, 0
    for entry in tqdm(image_files, desc="Downloading photos", unit="photo"):
        dest_path = output_dir / entry.name

        if dest_path.exists() and not args.overwrite:
            skipped += 1
            continue

        if download_file(dbx, args.shared_link, entry, dest_path):
            downloaded += 1
        else:
            failed += 1

    logger.info(
        "Done. Downloaded %d, skipped %d (already existed), failed %d. Saved to %s",
        downloaded, skipped, failed, output_dir.resolve(),
    )

    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
