# Posting Curator — Wedding Photo Curation

Tools for pulling a wedding photographer's Dropbox delivery down locally so
it can be curated/processed.

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

### 1. Create a Dropbox app

1. Go to the [Dropbox App Console](https://www.dropbox.com/developers/apps)
   and create a new app (Scoped access, with the `files.metadata.read` and
   `files.content.read` / `sharing.read` permissions — or Full Dropbox
   access if the shared folder isn't in your own account).
2. Copy the **App key** and **App secret** into `.env` as `DROPBOX_APP_KEY`
   and `DROPBOX_APP_SECRET`.

### 2. Generate a refresh token

Refresh tokens don't expire, so you only need to do this once per app:

```bash
python scripts/0_get_refresh_token.py
```

Follow the printed URL, approve access, paste back the authorization code,
then copy the printed `DROPBOX_REFRESH_TOKEN=...` line into `.env`.

### 3. Set the shared folder link

Paste the Dropbox shared folder link (e.g. from "Copy link" on the wedding
photographer's folder) into `.env` as `DROPBOX_SHARED_FOLDER_LINK`.

## Usage

```bash
python scripts/1_fetch_photos.py
```

This downloads every image (jpg/png/heic/tiff/raw/etc.) from the shared
folder into `data/raw_photos/`, recursing into subfolders and flattening
their contents into unique filenames. Re-running the script skips files
already downloaded.

Useful flags:

| Flag | Description |
| --- | --- |
| `--link URL` | Override the shared folder link from `.env` |
| `--output-dir DIR` | Change the destination folder (default `data/raw_photos`) |
| `--limit N` | Only download the first N matching photos |
| `--no-recursive` | Only look at the top level of the shared folder |
| `--all-files` | Download every file, not just recognized image formats |
| `--overwrite` | Re-download files that already exist locally |
| `--dry-run` | Show what would be downloaded without downloading |

## Project layout

```
scripts/
  0_get_refresh_token.py  # one-time OAuth helper to mint a refresh token
  1_fetch_photos.py       # downloads photos from the shared folder
data/
  raw_photos/             # downloaded photos land here (gitignored)
.env.example              # template for required API keys/config
requirements.txt
```
