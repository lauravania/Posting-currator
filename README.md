# Posting Curator — Wedding Photo Curation

A small pipeline for curating wedding photos, starting with fetching the
raw photo dump from a shared Dropbox folder.

## Setup

1. **Install dependencies**

   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Create a Dropbox app**

   - Go to https://www.dropbox.com/developers/apps and click "Create app".
   - Choose "Scoped access" and either "Full Dropbox" or "App folder"
     access (Full Dropbox is required if the shared folder isn't inside
     the app's own folder).
   - Under the "Permissions" tab, enable:
     - `files.metadata.read`
     - `files.content.read`
     - `sharing.read`
   - Note the **App key** and **App secret** from the "Settings" tab.

3. **Configure your `.env`**

   ```bash
   cp .env.example .env
   ```

   Fill in `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, and
   `DROPBOX_SHARED_LINK` (the shared link to the wedding photo folder).

4. **Generate a refresh token (one-time)**

   ```bash
   python scripts/get_dropbox_refresh_token.py
   ```

   Follow the printed URL, approve access, paste back the authorization
   code, then copy the printed `DROPBOX_REFRESH_TOKEN` into `.env`. This
   token doesn't expire, so this step only needs to be done once.

## Usage

Download every photo from the shared folder into `data/raw_photos/`:

```bash
python scripts/1_fetch_photos.py
```

Options:

```bash
python scripts/1_fetch_photos.py \
  --link "https://www.dropbox.com/scl/fo/..." \
  --output-dir data/raw_photos \
  --no-recursive   # skip subfolders inside the shared folder
```

The script:

- Authenticates to the Dropbox API using the refresh-token OAuth flow
  (no browser interaction needed at run time).
- Lists all files in the shared folder (recursively, by default).
- Filters to common image formats (jpg, jpeg, png, heic, heif, tiff, bmp,
  gif, webp, raw, cr2, nef, arw, dng).
- Downloads each photo into `data/raw_photos/`, preserving any subfolder
  structure from the shared folder.
- Skips files that were already downloaded (matched by file size), so
  it's safe to re-run.

## Project layout

```
scripts/
  1_fetch_photos.py            # downloads photos from Dropbox
  get_dropbox_refresh_token.py # one-time helper to mint a refresh token
data/
  raw_photos/                  # downloaded photos land here (gitignored)
requirements.txt
.env.example                   # copy to .env and fill in secrets
```
