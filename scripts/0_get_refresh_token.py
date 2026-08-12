#!/usr/bin/env python3
"""
One-time helper to generate a long-lived Dropbox refresh token.

A refresh token lets scripts/1_fetch_photos.py authenticate without you
re-approving access every few hours. You only need to run this once per
Dropbox app.

Usage:
    python scripts/0_get_refresh_token.py

Requires DROPBOX_APP_KEY and DROPBOX_APP_SECRET to already be set in .env
(create the app at https://www.dropbox.com/developers/apps first).
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
            "ERROR: Set DROPBOX_APP_KEY and DROPBOX_APP_SECRET in your .env "
            "file before running this script.",
            file=sys.stderr,
        )
        return 1

    auth_flow = DropboxOAuth2FlowNoRedirect(
        app_key,
        app_secret,
        token_access_type="offline",  # "offline" is what yields a refresh_token
    )

    authorize_url = auth_flow.start()
    print("1. Open this URL in a browser and click 'Allow':")
    print(f"   {authorize_url}")
    print("2. Copy the authorization code Dropbox shows you.")
    auth_code = input("3. Paste the authorization code here: ").strip()

    try:
        result = auth_flow.finish(auth_code)
    except Exception as exc:  # noqa: BLE001 - surface any OAuth failure to the user
        print(f"ERROR: Could not complete OAuth flow: {exc}", file=sys.stderr)
        return 1

    print("\nSuccess! Add this line to your .env file:\n")
    print(f"DROPBOX_REFRESH_TOKEN={result.refresh_token}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
