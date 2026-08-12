# Posting-currator

Tooling for curating wedding photos before they go out to guests / social
media. The first step in the pipeline pulls the raw photo set down from a
shared Dropbox folder.

## Setup

1. Create a virtual environment and install dependencies:

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Create a Dropbox app at https://www.dropbox.com/developers/apps
   (Scoped access, with the `sharing.read` and `files.content.read`
   permissions enabled), then copy `.env.example` to `.env` and fill in
   `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, and `DROPBOX_SHARED_LINK`
   (the link to the shared folder containing the wedding photos).

3. Generate a long-lived refresh token (one-time, interactive):

   ```bash
   python scripts/get_dropbox_refresh_token.py
   ```

   Paste the printed value into `.env` as `DROPBOX_REFRESH_TOKEN`.

## Usage

```bash
python scripts/1_fetch_photos.py
```

This lists every image in the shared Dropbox folder and downloads it into
`data/raw_photos/`, skipping files that are already present and unchanged.

## Project layout

```
scripts/
  1_fetch_photos.py            # downloads photos from the Dropbox shared link
  get_dropbox_refresh_token.py # one-time helper to mint a refresh token
data/
  raw_photos/                  # downloaded images land here (gitignored)
.env.example                   # template for Dropbox API credentials
```
