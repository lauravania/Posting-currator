# Posting Currator — Wedding Photo Curation

Tools for pulling raw wedding photos from Dropbox and (in later pipeline
steps) curating/selecting the best shots for posting.

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in your real Dropbox credentials
```

### Dropbox app credentials

1. Create an app at https://www.dropbox.com/developers/apps with scoped
   access and the `sharing.read` + `files.content.read` permissions.
2. Generate a refresh token (one-time OAuth2 authorization code flow):

   ```bash
   # 1. Open in a browser (replace <APP_KEY>):
   https://www.dropbox.com/oauth2/authorize?client_id=<APP_KEY>&token_access_type=offline&response_type=code

   # 2. Approve access, copy the shown authorization code, then:
   curl https://api.dropboxapi.com/oauth2/token \
       -d code=<AUTH_CODE> \
       -d grant_type=authorization_code \
       -d client_id=<APP_KEY> \
       -d client_secret=<APP_SECRET>
   ```

   The JSON response includes `refresh_token` — put it in `.env`.
3. Set `DROPBOX_SHARED_LINK` to the shared folder URL containing the
   wedding photos.

## Usage

```bash
python scripts/1_fetch_photos.py
```

Downloads every image (jpg/png/heic/raw/etc.) found in the shared folder
(recursively) into `data/raw_photos/`. Re-running is safe — files already
present with a matching size are skipped.

Useful flags:

```bash
python scripts/1_fetch_photos.py --dry-run              # list files only
python scripts/1_fetch_photos.py --limit 20              # test on a subset
python scripts/1_fetch_photos.py --output-dir some/dir
python scripts/1_fetch_photos.py --shared-link "https://www.dropbox.com/scl/fo/..."
```

## Project layout

```
scripts/1_fetch_photos.py   # Dropbox -> data/raw_photos/
data/raw_photos/            # downloaded originals (gitignored)
.env.example                 # credential template (copy to .env)
requirements.txt
```
