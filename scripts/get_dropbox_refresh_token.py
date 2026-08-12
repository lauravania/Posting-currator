#!/usr/bin/env python3
"""
get_dropbox_refresh_token.py

One-time helper to generate the long-lived DROPBOX_REFRESH_TOKEN used by
scripts/1_fetch_photos.py. Run this once locally, follow the prompts, then
paste the resulting refresh token into your .env file.

Requires DROPBOX_APP_KEY and DROPBOX_APP_SECRET to already be set in .env
(or exported in your shell).

Usage:
    python scripts/get_dropbox_refresh_token.py
"""

import os
import sys

from dotenv import load_dotenv
from dropbox import DropboxOAuth2FlowNoRedirect


def main():
    load_dotenv()

    app_key = os.environ.get("DROPBOX_APP_KEY")
    app_secret = os.environ.get("DROPBOX_APP_SECRET")

    if not app_key or not app_secret:
        sys.exit(
            "Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET in your .env file "
            "(from your Dropbox app console) before running this script."
        )

    auth_flow = DropboxOAuth2FlowNoRedirect(
        app_key,
        consumer_secret=app_secret,
        token_access_type="offline",  # "offline" is what gets us a refresh token
    )

    authorize_url = auth_flow.start()
    print("1. Go to this URL in your browser:")
    print(f"   {authorize_url}")
    print("2. Click 'Allow' (you may need to log in first).")
    print("3. Copy the authorization code shown.\n")

    auth_code = input("Enter the authorization code here: ").strip()

    try:
        oauth_result = auth_flow.finish(auth_code)
    except Exception as exc:
        sys.exit(f"Failed to obtain token: {exc}")

    print("\nSuccess! Add this to your .env file:\n")
    print(f"DROPBOX_REFRESH_TOKEN={oauth_result.refresh_token}")


if __name__ == "__main__":
    main()
