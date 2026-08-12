# Posting Curator

Tools for curating wedding photos: fetching them from a shared Dropbox
folder, then (in later pipeline steps) filtering, ranking, and preparing
them for posting.

## Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Dropbox API credentials

1. Create an app at the [Dropbox App Console](https://www.dropbox.com/developers/apps):
   - Choose **Scoped access**.
   - Under **Permissions**, enable: `sharing.read`, `files.metadata.read`, `files.content.read`.
   - Note the **App key** and **App secret** from the **Settings** tab.
2. Copy `.env.example` to `.env` and fill in `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET`.
3. Generate a long-lived refresh token (one-time step):
   ```bash
   python scripts/get_refresh_token.py
   ```
   Follow the printed link, approve access, paste back the code, then copy the
   printed `DROPBOX_REFRESH_TOKEN` into `.env`.
4. Set `DROPBOX_SHARED_LINK` in `.env` to the Dropbox shared folder URL
   containing the wedding photos.

`.env` is git-ignored — never commit real credentials. `.env.example` is the
template that documents the required variables.

## Usage

### 1. Fetch photos

Downloads every image in the shared Dropbox folder into `data/raw_photos/`:

```bash
python scripts/1_fetch_photos.py
```

Options:

```bash
# Override the shared link or output directory
python scripts/1_fetch_photos.py --shared-link "https://www.dropbox.com/scl/fo/..." --output-dir data/raw_photos

# Only fetch the first 20 images (useful for testing)
python scripts/1_fetch_photos.py --limit 20

# Preview what would be downloaded without saving anything
python scripts/1_fetch_photos.py --dry-run

# Re-download files that already exist locally
python scripts/1_fetch_photos.py --overwrite
```

Already-downloaded files are skipped by default, so the script is safe to
re-run to pick up new photos added to the shared folder later.

## Project structure

```
scripts/
  get_refresh_token.py   # one-time OAuth helper to obtain a refresh token
  1_fetch_photos.py       # downloads photos from the Dropbox shared folder
data/
  raw_photos/              # downloaded images land here (git-ignored)
.env.example               # template for required environment variables
requirements.txt
```
