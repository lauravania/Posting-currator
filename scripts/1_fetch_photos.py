"""Download wedding photos from a Dropbox shared folder link.

Authenticates against the Dropbox API using a long-lived refresh token
(no interactive browser login required at run time), lists every image in
the shared folder pointed to by DROPBOX_SHARED_LINK, and downloads each
one into data/raw_photos/.

Setup:
    1. Create a Dropbox app at https://www.dropbox.com/developers/apps
    2. Fill in DROPBOX_APP_KEY / DROPBOX_APP_SECRET / DROPBOX_SHARED_LINK
       in .env (copy .env.example if you haven't already).
    3. Run `python scripts/get_dropbox_refresh_token.py` once to obtain
       DROPBOX_REFRESH_TOKEN and add it to .env.

Usage:
    python scripts/1_fetch_photos.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import dropbox
from dropbox.exceptions import ApiError, AuthError
from dropbox.files import FileMetadata, SharedLink
from dotenv import load_dotenv
from tqdm import tqdm

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".webp"}

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_ROOT / "data" / "raw_photos"


def load_config() -> dict:
    load_dotenv(PROJECT_ROOT / ".env")

    env_vars = {
        "app_key": "DROPBOX_APP_KEY",
        "app_secret": "DROPBOX_APP_SECRET",
        "refresh_token": "DROPBOX_REFRESH_TOKEN",
        "shared_link": "DROPBOX_SHARED_LINK",
    }
    config = {key: os.getenv(env_name) for key, env_name in env_vars.items()}

    missing = [env_name for key, env_name in env_vars.items() if not config[key]]
    if missing:
        sys.exit(
            "Missing required .env values: "
            + ", ".join(missing)
            + "\nSee .env.example for what's needed and how to get it."
        )

    return config


def get_client(config: dict) -> dropbox.Dropbox:
    dbx = dropbox.Dropbox(
        oauth2_refresh_token=config["refresh_token"],
        app_key=config["app_key"],
        app_secret=config["app_secret"],
    )
    try:
        dbx.users_get_current_account()
    except AuthError as exc:
        sys.exit(f"Dropbox authentication failed: {exc}")
    return dbx


def list_shared_folder_images(dbx: dropbox.Dropbox, shared_link: str) -> list[FileMetadata]:
    """Recursively list image files in a Dropbox shared folder, by link."""
    link = SharedLink(url=shared_link)
    images: list[FileMetadata] = []

    try:
        result = dbx.files_list_folder(path="", shared_link=link, recursive=True)
    except ApiError as exc:
        sys.exit(f"Failed to list shared folder contents: {exc}")

    while True:
        for entry in result.entries:
            if isinstance(entry, FileMetadata) and Path(entry.name).suffix.lower() in IMAGE_EXTENSIONS:
                images.append(entry)

        if not result.has_more:
            break
        result = dbx.files_list_folder_continue(result.cursor)

    return images


def download_images(dbx: dropbox.Dropbox, shared_link: str, images: list[FileMetadata]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    downloaded, skipped, failed = 0, 0, 0

    for entry in tqdm(images, desc="Downloading photos", unit="photo"):
        dest_path = OUTPUT_DIR / entry.name

        if dest_path.exists() and dest_path.stat().st_size == entry.size:
            skipped += 1
            continue

        try:
            metadata, response = dbx.sharing_get_shared_link_file(url=shared_link, path=entry.path_lower)
            dest_path.write_bytes(response.content)
            downloaded += 1
        except ApiError as exc:
            tqdm.write(f"  Failed to download {entry.name}: {exc}")
            failed += 1

    print(
        f"\nDone. Downloaded {downloaded}, skipped {skipped} (already present), "
        f"failed {failed}. Output: {OUTPUT_DIR}"
    )


def main() -> None:
    config = load_config()
    dbx = get_client(config)

    print(f"Listing images in shared folder: {config['shared_link']}")
    images = list_shared_folder_images(dbx, config["shared_link"])

    if not images:
        print("No images found in the shared folder.")
        return

    print(f"Found {len(images)} image(s).")
    download_images(dbx, config["shared_link"], images)


if __name__ == "__main__":
    main()
