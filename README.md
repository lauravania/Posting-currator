# Wedding Photo Curator

A local Flask web app for curating wedding photos and preparing them for
social posting — no terminal use required after the one-time setup below.
Everything runs in your browser across five connected pages.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:5000** in your browser. That's it — all credentials
are entered and saved from the Settings page; you never need to hand-edit
`.env`.

### Before you start: create a Dropbox app

1. Go to the [Dropbox App Console](https://www.dropbox.com/developers/apps)
   and create a new app (Scoped access, with `files.metadata.read`,
   `files.content.read`, and `sharing.read` permissions).
2. Under **OAuth 2 → Redirect URIs**, add:
   `http://127.0.0.1:5000/api/dropbox/oauth/callback`
   (match the host/port you actually run the app on).
3. Copy the App key and App secret — you'll paste these into the app's
   Settings page.

You'll also need an [Anthropic API key](https://console.anthropic.com/settings/keys).

## The five pages

1. **Settings** — enter Dropbox App Key/Secret, Anthropic API key, and the
   Dropbox shared folder link. Click **Save Settings**, then **Connect
   Dropbox** to run the OAuth flow (opens Dropbox's login/allow page in a
   popup and stores a refresh token automatically). Everything is written
   to a local `.env` file for you.
2. **Fetch Photos** — pulls every image from the connected shared folder
   into `data/raw_photos/` (paginated, non-images skipped, safe to re-run —
   already-downloaded files are skipped). Shows live progress and a
   thumbnail gallery as photos come in.
3. **Style Analysis** — upload a competitor engagement CSV (columns:
   image filename, likes, comments, saves — plus optional caption and a
   date/time column) and the matching images. **Analyze Style** calls
   Claude with vision on the top 20% of posts by weighted engagement
   (saves weighted highest, then comments, then likes) and builds a
   readable style profile — composition, color grading, moment types,
   caption tone/length, common hashtags — saved to
   `config/style_profile.json`.
4. **Score & Review** — runs blur (Laplacian variance), exposure
   (histogram), and face/eyes-open checks locally with OpenCV, then a
   Claude vision call scores each photo 1–10 against the style profile
   with reasoning. Click any photo to include/exclude it, then **Confirm
   Selection** copies the included photos to `data/selected_photos/`.
5. **Caption & Schedule** — generates a caption, 5–10 hashtags, alt text,
   and a suggested post day/time (computed from your CSV's engagement
   patterns by day/hour when it has timestamp data; otherwise a documented
   default) for every confirmed photo. Edit anything inline, then **Save
   Final Output** exports everything to `output/results.json`.

Every "start" action runs as a background job with a live progress bar; the
UI polls status rather than blocking, and any failure (bad credentials, API
errors, unreadable files) shows as a clear on-screen message instead of
crashing.

## Project layout

```
app.py                     # Flask routes for all 5 pages + APIs
config.py                  # paths, .env loading
services/
  env_utils.py             # read/write/mask .env values
  dropbox_service.py       # OAuth flow + shared-folder fetch
  image_utils.py           # thumbnails, vision-ready downscaling
  technical_checks.py      # blur / exposure / face-eyes (OpenCV)
  csv_utils.py             # competitor CSV parsing + engagement ranking
  anthropic_service.py     # style analysis / scoring / caption generation
  pipeline.py              # the 3 background job bodies
  jobs.py                  # tiny background job/progress tracker
  storage.py                # JSON read/write helpers
templates/, static/        # Jinja2 pages + plain CSS/JS (no build step)
data/
  raw_photos/               # fetched from Dropbox
  competitor_photos/         # uploaded on the Style Analysis page
  selected_photos/           # confirmed selection
config/style_profile.json  # generated
output/results.json        # final export
scripts/                   # optional CLI equivalents (see below)
```

## Notes

- **Cost/latency**: scoring and caption generation call the Anthropic API
  once per photo. These calls use Claude Opus 5 with vision at a lower
  effort level to keep this reasonable, but a large shoot (hundreds of
  photos) will still take a while and incur real API cost — consider
  testing on a subset first.
- **HEIC photos**: the built-in image libraries used here don't decode
  HEIC/HEIF. If your Dropbox folder has iPhone-format originals, convert
  to JPEG before fetching, or ask to have `pillow-heif` added.
- **Re-running steps**: Fetch Photos and Style Analysis are safe to re-run
  (Fetch skips existing files; Style Analysis and Scoring simply
  regenerate their output). Confirm Selection always makes
  `data/selected_photos/` exactly match your current include/exclude
  choices.

## Optional: CLI-only Dropbox fetch

`scripts/1_fetch_photos.py` (with `scripts/0_get_refresh_token.py` for the
one-time OAuth token) is a standalone terminal alternative to the Fetch
Photos page, useful for automation. See the docstrings in those files, or
run `python scripts/1_fetch_photos.py --help`. It reads the same `.env`
file as the web app.
