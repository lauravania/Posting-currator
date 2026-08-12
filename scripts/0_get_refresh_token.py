#!/usr/bin/env python3
"""One-time helper to mint a Dropbox OAuth2 refresh token.

Dropbox's refresh-token flow needs a single interactive authorization to
produce a long-lived refresh token; after that, 1_fetch_photos.py can
silently exchange it for short-lived access tokens on every run.

Usage:
    python scripts/0_get_refresh_token.py

Reads DROPBOX_APP_KEY / DROPBOX_APP_SECRET from .env, walks you through the
browser authorization step, and prints the resulting refresh token so you
can paste it into .env as DROPBOX_REFRESH_TOKEN.
"""
from __future__ import annotations

import os
import sys

from dotenv import load_dotenv
from dropbox import DropboxOAuth2FlowNoRedirect


def main() -> int:
    load_dotenv()

    app_key = os.environ.get("DROPBOX_APP_KEY")
    app_secret = os.environ.get("DROPBOX_APP_SECRET")

    if not app_key or not app_secret:
        print(
            "DROPBOX_APP_KEY and DROPBOX_APP_SECRET must be set in .env "
            "before running this script.",
            file=sys.stderr,
        )
        return 1

    auth_flow = DropboxOAuth2FlowNoRedirect(
        app_key,
        consumer_secret=app_secret,
        token_access_type="offline",  # "offline" is what yields a refresh token
    )

    authorize_url = auth_flow.start()
    print("1. Go to this URL in your browser:")
    print(f"   {authorize_url}")
    print("2. Click 'Allow' (you may need to log in first).")
    print("3. Copy the authorization code shown on that page.\n")

    auth_code = input("Enter the authorization code here: ").strip()

    try:
        result = auth_flow.finish(auth_code)
    except Exception as exc:  # noqa: BLE001 - surface any OAuth failure to the user
        print(f"Error obtaining refresh token: {exc}", file=sys.stderr)
        return 1

    print("\nSuccess! Add this to your .env file:\n")
    print(f"DROPBOX_REFRESH_TOKEN={result.refresh_token}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
