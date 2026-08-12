# Posting Curator — Wedding Photo Curation

Tools for pulling wedding photos out of a shared Dropbox folder and curating
them for posting.

## Project layout

```
scripts/
  1_fetch_photos.py   # downloads images from a Dropbox shared folder link
data/
  raw_photos/          # downloaded originals land here (git-ignored)
requirements.txt
.env.example            # template for required API keys — copy to .env
```

## Setup

1. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

2. **Create a Dropbox app**

   - Go to https://www.dropbox.com/developers/apps and click "Create app".
   - Choose "Scoped access" and either "Full Dropbox" or "App folder" access
     (Full Dropbox is required if the shared folder isn't inside the app's
     own folder).
   - Under the "Permissions" tab, enable at least:
     - `files.metadata.read`
     - `files.content.read`
     - `sharing.read`
   - Note the **App key** and **App secret** from the "Settings" tab.

3. **Get a refresh token (one-time)**

   Refresh tokens don't expire, so you only need to do this once. Run the
   OAuth2 "authorization code" flow with offline access:

   a. Open this URL in a browser, substituting your app key:

      ```
      https://www.dropbox.com/oauth2/authorize?client_id=<APP_KEY>&token_access_type=offline&response_type=code
      ```

   b. Approve access and copy the authorization code shown.

   c. Exchange it for a refresh token:

      ```bash
      curl https://api.dropboxapi.com/oauth2/token \
        -d code=<AUTH_CODE> \
        -d grant_type=authorization_code \
        -d client_id=<APP_KEY> \
        -d client_secret=<APP_SECRET>
      ```

   d. The JSON response includes a `refresh_token` field — save it.

4. **Configure `.env`**

   ```bash
   cp .env.example .env
   ```

   Fill in:

   ```
   DROPBOX_APP_KEY=...
   DROPBOX_APP_SECRET=...
   DROPBOX_REFRESH_TOKEN=...
   DROPBOX_SHARED_LINK=https://www.dropbox.com/scl/fo/.../...?rlkey=...&dl=0
   ```

   `.env` is git-ignored — never commit real credentials.

## Usage

```bash
python scripts/1_fetch_photos.py
```

Options:

```bash
python scripts/1_fetch_photos.py \
  --link "https://www.dropbox.com/scl/fo/.../...?rlkey=...&dl=0" \
  --out data/raw_photos \
  --recursive   # also descend into subfolders of the shared folder
```

The script:

- Authenticates using the refresh token (a fresh access token is minted
  automatically on every run — no manual re-login).
- Lists the contents of the shared folder via the Dropbox API.
- Filters to image files (jpg, jpeg, png, heic, heif, tif, tiff, bmp, gif,
  webp, raw, cr2, nef, arw, dng).
- Downloads each image into `data/raw_photos/`, skipping files that are
  already present with a matching size.
