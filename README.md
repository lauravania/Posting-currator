# Posting Curator

Tools for curating wedding photos before posting/sharing them.

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env
```

### Dropbox API access (refresh-token flow)

1. Create an app at https://www.dropbox.com/developers/apps
   - Choose **Scoped access**
   - Enable these permissions on the app's "Permissions" tab:
     `files.metadata.read`, `files.content.read`, `sharing.read`
2. Copy the app's **App key** and **App secret** into `.env`
   (`DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`).
3. Generate a long-lived refresh token (one-time step):

   ```bash
   python scripts/0_get_refresh_token.py
   ```

   Follow the printed link, authorize the app, paste back the code, and
   copy the resulting refresh token into `.env` as `DROPBOX_REFRESH_TOKEN`.
4. Set `DROPBOX_SHARED_FOLDER_URL` in `.env` to the Dropbox shared folder
   link containing the wedding photos.

`.env` is git-ignored — never commit real credentials.

## Usage

### 1. Fetch photos

Downloads every image from the shared folder into `data/raw_photos/`:

```bash
python scripts/1_fetch_photos.py
```

Options:

```bash
python scripts/1_fetch_photos.py --url <shared_folder_url> --out data/raw_photos
python scripts/1_fetch_photos.py --dry-run   # list matching images without downloading
python scripts/1_fetch_photos.py --limit 20  # cap number of downloads (testing)
```

The script is resumable — it skips files that already exist locally with a
matching size, and preserves the shared folder's subfolder structure under
the output directory.

## Project layout

```
scripts/
  0_get_refresh_token.py   # one-time helper to mint a Dropbox refresh token
  1_fetch_photos.py        # downloads photos from the shared Dropbox folder
data/
  raw_photos/               # downloaded images land here (git-ignored)
.env.example                 # template for required API credentials
requirements.txt
```
