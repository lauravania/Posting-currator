"""
Flask app for wedding photo curation and social posting.

Five pages, each backed by a handful of small JSON APIs:
  1. /settings  — credentials, saved to .env, no manual file editing
  2. /fetch     — pull photos from the connected Dropbox shared folder
  3. /style     — analyze competitor engagement to build a style profile
  4. /score     — technical + AI scoring, manual include/exclude, confirm
  5. /captions  — generate + edit captions/hashtags/alt text, export

Run with `python app.py` — see README for the local URL.
"""
from __future__ import annotations

from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, send_from_directory, session
from werkzeug.utils import secure_filename

import config
from services import csv_utils
from services.anthropic_service import AnthropicConfigError
from services.dropbox_service import (
    DropboxConfigError,
    fetch_photos,
    finish_oauth,
    start_oauth,
)
from services.env_utils import get_settings_status, save_env_vars
from services.image_utils import get_or_create_thumbnail
from services.jobs import JOBS
from services.pipeline import run_caption_generation, run_scoring, run_style_analysis
from services.storage import read_json, write_json

app = Flask(__name__)
app.secret_key = config.ensure_flask_secret()

MEDIA_SPACES = {
    "raw": config.RAW_PHOTOS_DIR,
    "competitor": config.COMPETITOR_DIR,
    "selected": config.SELECTED_PHOTOS_DIR,
}


def handle_errors(fn):
    """Every API route uses this so failures come back as a JSON
    {"error": ...} the frontend can show, instead of a raw 500 page or a
    silent crash."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except (DropboxConfigError, AnthropicConfigError, csv_utils.CsvFormatError) as exc:
            return jsonify({"error": str(exc)}), 400
        except FileNotFoundError as exc:
            return jsonify({"error": str(exc)}), 404
        except Exception as exc:  # noqa: BLE001 - last resort, always return JSON
            app.logger.exception("Unhandled error in %s", fn.__name__)
            return jsonify({"error": f"Unexpected error: {exc}"}), 500
    return wrapper


def _list_images(directory: Path) -> list[Path]:
    return sorted(p for p in directory.iterdir() if p.is_file() and p.suffix.lower() in config.IMAGE_EXTENSIONS)


# ------------------------------------------------------------------ pages --

@app.route("/")
def index():
    return redirect("/settings")


@app.route("/settings")
def settings_page():
    return render_template("settings.html", status=get_settings_status(), active="settings")


@app.route("/fetch")
def fetch_page():
    return render_template("fetch.html", active="fetch")


@app.route("/style")
def style_page():
    return render_template("style.html", active="style")


@app.route("/score")
def score_page():
    return render_template("score.html", active="score")


@app.route("/captions")
def captions_page():
    return render_template("captions.html", active="captions")


# --------------------------------------------------------------- media -----

@app.route("/media/<space>/<path:filename>")
def media_file(space, filename):
    directory = MEDIA_SPACES.get(space)
    if directory is None:
        return jsonify({"error": "unknown media space"}), 404
    return send_from_directory(str(directory), filename)


@app.route("/media/<space>/thumb/<path:filename>")
def media_thumb(space, filename):
    directory = MEDIA_SPACES.get(space)
    if directory is None:
        return jsonify({"error": "unknown media space"}), 404
    source = directory / filename
    if not source.exists() or not source.is_file():
        return jsonify({"error": "not found"}), 404
    try:
        thumb_path = get_or_create_thumbnail(source, space)
    except Exception:  # noqa: BLE001 - unreadable image (e.g. unsupported HEIC); fall back to original
        return send_from_directory(str(directory), filename)
    return send_from_directory(str(thumb_path.parent), thumb_path.name)


# ------------------------------------------------------------- settings ----

@app.route("/api/settings/status")
@handle_errors
def api_settings_status():
    return jsonify(get_settings_status())


@app.route("/api/settings", methods=["POST"])
@handle_errors
def api_settings_save():
    body = request.get_json(force=True, silent=True) or {}
    save_env_vars({
        "DROPBOX_APP_KEY": body.get("dropbox_app_key", ""),
        "DROPBOX_APP_SECRET": body.get("dropbox_app_secret", ""),
        "DROPBOX_SHARED_FOLDER_LINK": body.get("dropbox_shared_folder_link", ""),
        "ANTHROPIC_API_KEY": body.get("anthropic_api_key", ""),
    })
    return jsonify({"ok": True, "status": get_settings_status()})


@app.route("/api/dropbox/oauth/start")
@handle_errors
def api_dropbox_oauth_start():
    redirect_uri = config.dropbox_redirect_uri(request.host_url)
    url = start_oauth(session, redirect_uri)
    return redirect(url)


@app.route("/api/dropbox/oauth/callback")
def api_dropbox_oauth_callback():
    redirect_uri = config.dropbox_redirect_uri(request.host_url)
    try:
        finish_oauth(session, redirect_uri, request.args)
    except Exception as exc:  # noqa: BLE001
        return render_template("oauth_result.html", success=False, message=str(exc))
    return render_template("oauth_result.html", success=True, message="Dropbox connected successfully.")


# ----------------------------------------------------------------- fetch ---

@app.route("/api/fetch/start", methods=["POST"])
@handle_errors
def api_fetch_start():
    started = JOBS["fetch"].start(fetch_photos)
    if not started:
        return jsonify({"error": "A fetch is already running."}), 409
    return jsonify({"ok": True})


@app.route("/api/fetch/status")
@handle_errors
def api_fetch_status():
    return jsonify(JOBS["fetch"].to_dict())


@app.route("/api/fetch/gallery")
@handle_errors
def api_fetch_gallery():
    photos = _list_images(config.RAW_PHOTOS_DIR)
    return jsonify({
        "count": len(photos),
        "photos": [{"filename": p.name, "url": f"/media/raw/{p.name}", "thumb_url": f"/media/raw/thumb/{p.name}"} for p in photos],
    })


# ----------------------------------------------------------------- style ---

@app.route("/api/style/uploads")
@handle_errors
def api_style_uploads():
    csv_exists = config.COMPETITOR_CSV_PATH.exists()
    row_count = None
    if csv_exists:
        try:
            row_count = len(csv_utils.load_competitor_csv(config.COMPETITOR_CSV_PATH))
        except csv_utils.CsvFormatError:
            row_count = None
    images = _list_images(config.COMPETITOR_DIR)
    return jsonify({
        "csv_uploaded": csv_exists,
        "csv_row_count": row_count,
        "image_count": len(images),
        "images": [{"filename": p.name, "thumb_url": f"/media/competitor/thumb/{p.name}"} for p in images],
    })


@app.route("/api/style/upload", methods=["POST"])
@handle_errors
def api_style_upload():
    csv_file = request.files.get("csv")
    if csv_file and csv_file.filename:
        config.COMPETITOR_CSV_PATH.write_bytes(csv_file.read())

    saved = 0
    for file in request.files.getlist("images"):
        if not file or not file.filename:
            continue
        name = Path(file.filename).name  # strip any path components
        if not name or name in (".", ".."):
            continue
        if Path(name).suffix.lower() not in config.IMAGE_EXTENSIONS:
            continue
        file.save(str(config.COMPETITOR_DIR / name))
        saved += 1

    return jsonify({"ok": True, "images_saved": saved, "csv_saved": bool(csv_file and csv_file.filename)})


@app.route("/api/style/analyze", methods=["POST"])
@handle_errors
def api_style_analyze():
    started = JOBS["style"].start(run_style_analysis)
    if not started:
        return jsonify({"error": "Style analysis is already running."}), 409
    return jsonify({"ok": True})


@app.route("/api/style/status")
@handle_errors
def api_style_status():
    return jsonify(JOBS["style"].to_dict())


@app.route("/api/style/profile")
@handle_errors
def api_style_profile():
    profile = read_json(config.STYLE_PROFILE_PATH)
    if profile is None:
        return jsonify({"exists": False})
    return jsonify({"exists": True, "profile": profile})


# ----------------------------------------------------------------- score ---

@app.route("/api/score/start", methods=["POST"])
@handle_errors
def api_score_start():
    started = JOBS["score"].start(run_scoring)
    if not started:
        return jsonify({"error": "Scoring is already running."}), 409
    return jsonify({"ok": True})


@app.route("/api/score/status")
@handle_errors
def api_score_status():
    return jsonify(JOBS["score"].to_dict())


@app.route("/api/score/results")
@handle_errors
def api_score_results():
    results = read_json(config.SCORES_PATH, [])
    results = sorted(results, key=lambda r: (r.get("score") is None, -(r.get("score") or 0)))
    for r in results:
        r["thumb_url"] = f"/media/raw/thumb/{r['filename']}"
        r["url"] = f"/media/raw/{r['filename']}"
    return jsonify({"photos": results})


@app.route("/api/score/toggle", methods=["POST"])
@handle_errors
def api_score_toggle():
    body = request.get_json(force=True, silent=True) or {}
    filename = body.get("filename")
    included = bool(body.get("included"))
    results = read_json(config.SCORES_PATH, [])
    found = False
    for r in results:
        if r["filename"] == filename:
            r["included"] = included
            found = True
            break
    if not found:
        return jsonify({"error": f"Unknown photo: {filename}"}), 404
    write_json(config.SCORES_PATH, results)
    return jsonify({"ok": True})


@app.route("/api/score/confirm", methods=["POST"])
@handle_errors
def api_score_confirm():
    results = read_json(config.SCORES_PATH, [])
    included = [r["filename"] for r in results if r.get("included")]
    if not included:
        return jsonify({"error": "No photos are marked included."}), 400

    # Selected folder always mirrors the current selection exactly.
    for existing in config.SELECTED_PHOTOS_DIR.iterdir():
        if existing.is_file():
            existing.unlink()

    copied = 0
    missing = []
    for filename in included:
        src = config.RAW_PHOTOS_DIR / filename
        if not src.exists():
            missing.append(filename)
            continue
        (config.SELECTED_PHOTOS_DIR / filename).write_bytes(src.read_bytes())
        copied += 1

    return jsonify({"ok": True, "copied": copied, "missing": missing})


# --------------------------------------------------------------captions ---

@app.route("/api/captions/generate", methods=["POST"])
@handle_errors
def api_captions_generate():
    started = JOBS["captions"].start(run_caption_generation)
    if not started:
        return jsonify({"error": "Caption generation is already running."}), 409
    return jsonify({"ok": True})


@app.route("/api/captions/status")
@handle_errors
def api_captions_status():
    return jsonify(JOBS["captions"].to_dict())


@app.route("/api/captions/results")
@handle_errors
def api_captions_results():
    data = read_json(config.CAPTIONS_PATH, {"posting_slot": None, "photos": []})
    for p in data.get("photos", []):
        p["thumb_url"] = f"/media/selected/thumb/{p['filename']}"
        p["url"] = f"/media/selected/{p['filename']}"
    return jsonify(data)


@app.route("/api/captions/update", methods=["POST"])
@handle_errors
def api_captions_update():
    body = request.get_json(force=True, silent=True) or {}
    filename = body.get("filename")
    data = read_json(config.CAPTIONS_PATH, {"posting_slot": None, "photos": []})
    found = False
    for p in data.get("photos", []):
        if p["filename"] == filename:
            for field in ("caption", "alt_text", "suggested_day", "suggested_time"):
                if field in body:
                    p[field] = body[field]
            if "hashtags" in body:
                tags = body["hashtags"]
                if isinstance(tags, str):
                    tags = [t.strip() for t in tags.replace(",", " ").split() if t.strip()]
                p["hashtags"] = tags
            found = True
            break
    if not found:
        return jsonify({"error": f"Unknown photo: {filename}"}), 404
    write_json(config.CAPTIONS_PATH, data)
    return jsonify({"ok": True})


@app.route("/api/captions/save", methods=["POST"])
@handle_errors
def api_captions_save():
    captions_data = read_json(config.CAPTIONS_PATH, {"posting_slot": None, "photos": []})
    scores_by_filename = {s["filename"]: s for s in read_json(config.SCORES_PATH, [])}
    profile = read_json(config.STYLE_PROFILE_PATH, {})

    photos = []
    for p in captions_data.get("photos", []):
        score_info = scores_by_filename.get(p["filename"], {})
        photos.append({
            "filename": p["filename"],
            "score": score_info.get("score"),
            "score_reasoning": score_info.get("reasoning"),
            "caption": p.get("caption", ""),
            "hashtags": p.get("hashtags", []),
            "alt_text": p.get("alt_text", ""),
            "suggested_day": p.get("suggested_day"),
            "suggested_time": p.get("suggested_time"),
        })

    output = {
        "style_profile_summary": profile.get("summary"),
        "posting_slot": captions_data.get("posting_slot"),
        "photo_count": len(photos),
        "photos": photos,
    }
    write_json(config.RESULTS_PATH, output)
    return jsonify({"ok": True, "path": str(config.RESULTS_PATH), "photo_count": len(photos)})


if __name__ == "__main__":
    port = 5000
    print(f"\n  Wedding Photo Curator running at http://127.0.0.1:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
