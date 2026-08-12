"""
One-time helper to generate a long-lived Dropbox OAuth2 refresh token.

Run this once after creating a Dropbox app (Scoped access, with the
sharing.read, files.metadata.read, and files.content.read permissions
enabled). It walks you through the OAuth2 "no redirect" flow and prints
the refresh token to save into your `.env` file as DROPBOX_REFRESH_TOKEN.

Usage:
    python scripts/get_refresh_token.py
"""

import os
import sys

import dropbox
from dropbox import DropboxOAuth2FlowNoRedirect
from dotenv import load_dotenv

load_dotenv()


def main() -> None:
    app_key = os.environ.get("DROPBOX_APP_KEY") or input("Dropbox app key: ").strip()
    app_secret = os.environ.get("DROPBOX_APP_SECRET") or input("Dropbox app secret: ").strip()

    if not app_key or not app_secret:
        sys.exit("DROPBOX_APP_KEY and DROPBOX_APP_SECRET are required.")

    auth_flow = DropboxOAuth2FlowNoRedirect(
        app_key,
        consumer_secret=app_secret,
        token_access_type="offline",  # "offline" is what gets us a refresh token
    )

    authorize_url = auth_flow.start()
    print("1. Go to this URL in your browser:")
    print(f"   {authorize_url}")
    print("2. Click 'Allow' (you may need to log in first).")
    print("3. Copy the authorization code shown on the page.\n")

    auth_code = input("Enter the authorization code here: ").strip()

    try:
        oauth_result = auth_flow.finish(auth_code)
    except Exception as exc:  # noqa: BLE001
        sys.exit(f"Error authorizing token: {exc}")

    print("\nSuccess! Add these to your .env file:\n")
    print(f"DROPBOX_APP_KEY={app_key}")
    print(f"DROPBOX_APP_SECRET={app_secret}")
    print(f"DROPBOX_REFRESH_TOKEN={oauth_result.refresh_token}")


if __name__ == "__main__":
    main()
