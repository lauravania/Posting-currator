"""
Job bodies for the three long-running pipeline steps (style analysis,
scoring, caption generation). Each function has the signature expected by
services.jobs.Job.start(): fn(job) -> None, reporting progress via
job.set_progress(...) and raising on unrecoverable errors (individual
per-photo failures are caught and recorded instead of aborting the run).
"""
from __future__ import annotations

from config import (
    COMPETITOR_CSV_PATH,
    RAW_PHOTOS_DIR,
    SELECTED_PHOTOS_DIR,
    STYLE_PROFILE_PATH,
    SCORES_PATH,
    CAPTIONS_PATH,
    IMAGE_EXTENSIONS,
)
from services import anthropic_service, csv_utils
from services.dropbox_service import is_image
from services.jobs import Job
from services.storage import read_json, write_json
from services.technical_checks import analyze_technical

SCORE_INCLUDE_THRESHOLD = 6


def _list_images(directory) -> list:
    return sorted(p for p in directory.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS)


def run_style_analysis(job: Job) -> None:
    if not COMPETITOR_CSV_PATH.exists():
        raise RuntimeError("No competitor engagement CSV uploaded yet.")

    job.set_progress(phase="loading", message="Reading competitor engagement CSV...")
    df = csv_utils.load_competitor_csv(COMPETITOR_CSV_PATH)
    if df.empty:
        raise RuntimeError("The uploaded CSV has no rows.")

    top = csv_utils.top_posts_by_engagement(df, fraction=0.2)
    matched, missing = csv_utils.match_uploaded_images(top)
    if not matched:
        raise RuntimeError(
            "None of the top-engagement rows in your CSV matched an uploaded "
            "competitor image filename. Check that the 'image filename' column "
            "matches the files you uploaded exactly."
        )

    job.set_progress(
        phase="analyzing", total=len(matched), completed=0, missing=missing,
        message=f"Analyzing {len(matched)} top-performing post(s)...",
    )

    per_image_results = []
    errors = []
    for i, item in enumerate(matched):
        try:
            result = anthropic_service.analyze_competitor_image(item["local_path"], item["caption"])
            result["filename"] = item["filename"]
            result["weighted_engagement"] = item["weighted_engagement"]
            per_image_results.append(result)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{item['filename']}: {exc}")
        job.set_progress(completed=i + 1, errors=errors[-20:], message=f"Analyzed {i + 1}/{len(matched)}")

    if not per_image_results:
        raise RuntimeError("Every post failed to analyze — see errors for details: " + "; ".join(errors[:3]))

    job.set_progress(phase="synthesizing", message="Synthesizing overall style profile...")
    profile = anthropic_service.synthesize_style_profile(per_image_results, len(per_image_results))
    profile["_generated_from_post_count"] = len(per_image_results)
    profile["_missing_images"] = missing
    profile["_analysis_errors"] = errors

    write_json(STYLE_PROFILE_PATH, profile)
    job.set_progress(phase="done", message="Style profile ready.")


def run_scoring(job: Job) -> None:
    if not STYLE_PROFILE_PATH.exists():
        raise RuntimeError("No style profile yet — run Style Analysis first.")
    style_profile = read_json(STYLE_PROFILE_PATH, {})

    photos = _list_images(RAW_PHOTOS_DIR)
    if not photos:
        raise RuntimeError("No photos in data/raw_photos — fetch photos first.")

    job.set_progress(total=len(photos), completed=0, message=f"Scoring {len(photos)} photo(s)...")

    results = []
    for i, photo in enumerate(photos):
        try:
            technical = analyze_technical(photo)
        except Exception as exc:  # noqa: BLE001
            technical = {"error": str(exc)}

        try:
            if "error" in technical:
                scored = {"score": None, "reasoning": f"Could not read image for analysis: {technical['error']}"}
            else:
                scored = anthropic_service.score_photo(photo, style_profile, technical)
        except Exception as exc:  # noqa: BLE001
            scored = {"score": None, "reasoning": f"Scoring failed: {exc}"}

        score = scored.get("score")
        results.append({
            "filename": photo.name,
            "score": score,
            "reasoning": scored.get("reasoning", ""),
            "technical": technical,
            "included": isinstance(score, (int, float)) and score >= SCORE_INCLUDE_THRESHOLD,
        })
        job.set_progress(completed=i + 1, message=f"Scored {i + 1}/{len(photos)}: {photo.name}")

    write_json(SCORES_PATH, results)
    job.set_progress(phase="done", message="Scoring complete.")


def run_caption_generation(job: Job) -> None:
    if not STYLE_PROFILE_PATH.exists():
        raise RuntimeError("No style profile yet — run Style Analysis first.")
    selected = _list_images(SELECTED_PHOTOS_DIR)
    if not selected:
        raise RuntimeError(
            "No confirmed selection found. Go to Score & Review and click "
            "'Confirm Selection' first."
        )

    style_profile = read_json(STYLE_PROFILE_PATH, {})
    scores_by_filename = {s["filename"]: s for s in read_json(SCORES_PATH, [])}

    if COMPETITOR_CSV_PATH.exists():
        try:
            df = csv_utils.load_competitor_csv(COMPETITOR_CSV_PATH)
        except csv_utils.CsvFormatError:
            df = None
    else:
        df = None
    slot = csv_utils.best_posting_slot(df)

    job.set_progress(total=len(selected), completed=0, message=f"Writing captions for {len(selected)} photo(s)...")

    captions = []
    for i, photo in enumerate(selected):
        reasoning = scores_by_filename.get(photo.name, {}).get("reasoning")
        try:
            cap = anthropic_service.generate_caption(photo, style_profile, reasoning)
        except Exception as exc:  # noqa: BLE001
            cap = {"caption": "", "hashtags": [], "alt_text": "", "error": str(exc)}

        captions.append({
            "filename": photo.name,
            "caption": cap.get("caption", ""),
            "hashtags": cap.get("hashtags", []),
            "alt_text": cap.get("alt_text", ""),
            "suggested_day": slot["day"],
            "suggested_time": slot["time"],
            "error": cap.get("error"),
        })
        job.set_progress(completed=i + 1, message=f"Captioned {i + 1}/{len(selected)}: {photo.name}")

    write_json(CAPTIONS_PATH, {"posting_slot": slot, "photos": captions})
    job.set_progress(phase="done", message="Captions ready.")
