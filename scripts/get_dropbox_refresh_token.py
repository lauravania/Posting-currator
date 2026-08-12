"""One-time helper to mint a long-lived Dropbox refresh token.

Run this once after creating a Dropbox app and setting DROPBOX_APP_KEY /
DROPBOX_APP_SECRET in your .env file. It walks you through the OAuth2
"authorization code" flow and prints a refresh token that never expires
(until you revoke it) — paste it into .env as DROPBOX_REFRESH_TOKEN so
scripts/1_fetch_photos.py can use it without any further browser steps.

Usage:
    python scripts/get_dropbox_refresh_token.py
"""

import os
import sys

from dotenv import load_dotenv
from dropbox import DropboxOAuth2FlowNoRedirect

load_dotenv()

APP_KEY = os.getenv("DROPBOX_APP_KEY")
APP_SECRET = os.getenv("DROPBOX_APP_SECRET")


def main() -> None:
    if not APP_KEY or not APP_SECRET:
        sys.exit(
            "Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET in your .env file "
            "before running this script."
        )

    flow = DropboxOAuth2FlowNoRedirect(
        APP_KEY,
        APP_SECRET,
        token_access_type="offline",  # "offline" is what gets us a refresh token
    )

    authorize_url = flow.start()
    print("1. Go to this URL in your browser:")
    print(f"   {authorize_url}")
    print("2. Click 'Allow' (you may need to log in first).")
    print("3. Copy the authorization code Dropbox gives you.\n")

    auth_code = input("Enter the authorization code here: ").strip()

    try:
        result = flow.finish(auth_code)
    except Exception as exc:  # noqa: BLE001 - surface any OAuth failure directly
        sys.exit(f"OAuth flow failed: {exc}")

    print("\nSuccess! Add this line to your .env file:\n")
    print(f"DROPBOX_REFRESH_TOKEN={result.refresh_token}")


if __name__ == "__main__":
    main()
