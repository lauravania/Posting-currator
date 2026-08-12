"""
Parsing and analysis of the competitor engagement CSV: flexible column
matching, weighted-engagement ranking to find the top 20% of posts, and
(when timestamp data is present) the best day/time to post derived from
which slots the highest-engagement posts went out in.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Optional

import pandas as pd

from config import COMPETITOR_DIR

# Engagement weights: a save is the strongest signal of "I want this for
# myself" (common wedding-content heuristic), a comment is stronger than a
# like, both weighted above raw likes.
LIKE_WEIGHT = 1.0
COMMENT_WEIGHT = 3.0
SAVE_WEIGHT = 4.0

_FILENAME_CANDIDATES = ["filename", "image filename", "image_filename", "image", "file", "photo"]
_LIKES_CANDIDATES = ["likes", "like_count", "num_likes"]
_COMMENTS_CANDIDATES = ["comments", "comment_count", "num_comments"]
_SAVES_CANDIDATES = ["saves", "save_count", "num_saves", "bookmarks"]
_CAPTION_CANDIDATES = ["caption", "post_caption", "text"]
_DATETIME_CANDIDATES = ["posted_at", "date", "datetime", "timestamp", "post_date", "published_at"]
_DAY_CANDIDATES = ["day", "weekday", "day_of_week"]
_HOUR_CANDIDATES = ["hour", "time", "post_time", "hour_of_day"]

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


class CsvFormatError(ValueError):
    pass


def _find_column(columns: list[str], candidates: list[str]) -> Optional[str]:
    lowered = {c.lower().strip(): c for c in columns}
    for candidate in candidates:
        if candidate in lowered:
            return lowered[candidate]
    return None


def load_competitor_csv(csv_path: Path) -> pd.DataFrame:
    try:
        df = pd.read_csv(csv_path)
    except Exception as exc:  # noqa: BLE001
        raise CsvFormatError(f"Could not read CSV file: {exc}") from exc

    columns = list(df.columns)
    filename_col = _find_column(columns, _FILENAME_CANDIDATES)
    likes_col = _find_column(columns, _LIKES_CANDIDATES)
    comments_col = _find_column(columns, _COMMENTS_CANDIDATES)
    saves_col = _find_column(columns, _SAVES_CANDIDATES)

    missing = [
        label for label, col in [
            ("image filename", filename_col), ("likes", likes_col),
            ("comments", comments_col), ("saves", saves_col),
        ] if col is None
    ]
    if missing:
        raise CsvFormatError(
            "CSV is missing required column(s): " + ", ".join(missing) +
            ". Expected columns like: image filename, likes, comments, saves."
        )

    caption_col = _find_column(columns, _CAPTION_CANDIDATES)
    datetime_col = _find_column(columns, _DATETIME_CANDIDATES)
    day_col = _find_column(columns, _DAY_CANDIDATES)
    hour_col = _find_column(columns, _HOUR_CANDIDATES)

    out = pd.DataFrame()
    out["filename"] = df[filename_col].astype(str).str.strip()
    for label, col in (("likes", likes_col), ("comments", comments_col), ("saves", saves_col)):
        out[label] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    out["caption"] = df[caption_col].astype(str) if caption_col else ""

    if datetime_col:
        parsed = pd.to_datetime(df[datetime_col], errors="coerce")
        out["day_of_week"] = parsed.dt.dayofweek
        out["hour"] = parsed.dt.hour
    else:
        if day_col:
            out["day_of_week"] = df[day_col].apply(_parse_day)
        else:
            out["day_of_week"] = pd.NA
        if hour_col:
            out["hour"] = df[hour_col].apply(_parse_hour)
        else:
            out["hour"] = pd.NA

    out["weighted_engagement"] = (
        out["likes"] * LIKE_WEIGHT + out["comments"] * COMMENT_WEIGHT + out["saves"] * SAVE_WEIGHT
    )
    return out


def _parse_day(value) -> Optional[int]:
    if pd.isna(value):
        return None
    text = str(value).strip().lower()
    for i, name in enumerate(DAY_NAMES):
        if text == name.lower() or text == name[:3].lower():
            return i
    try:
        i = int(text)
        return i if 0 <= i <= 6 else None
    except ValueError:
        return None


def _parse_hour(value) -> Optional[int]:
    if pd.isna(value):
        return None
    text = str(value).strip()
    try:
        return int(float(text))
    except ValueError:
        pass
    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        return None
    return int(parsed.hour)


def top_posts_by_engagement(df: pd.DataFrame, fraction: float = 0.2) -> pd.DataFrame:
    n = max(1, math.ceil(len(df) * fraction))
    return df.sort_values("weighted_engagement", ascending=False).head(n)


def match_uploaded_images(rows: pd.DataFrame) -> list[dict]:
    """Pairs top-engagement CSV rows with actually-uploaded competitor
    image files (case-insensitive filename match). Rows with no matching
    upload are skipped and reported so the caller can surface a warning."""
    available = {p.name.lower(): p for p in COMPETITOR_DIR.iterdir() if p.is_file()}
    matched, missing = [], []
    for _, row in rows.iterrows():
        local_path = available.get(row["filename"].lower())
        if local_path is None:
            missing.append(row["filename"])
            continue
        matched.append({
            "filename": row["filename"],
            "local_path": local_path,
            "likes": float(row["likes"]),
            "comments": float(row["comments"]),
            "saves": float(row["saves"]),
            "weighted_engagement": float(row["weighted_engagement"]),
            "caption": row.get("caption", "") or "",
        })
    return matched, missing


def best_posting_slot(df: Optional[pd.DataFrame]) -> dict:
    """Best day/time to post, weighted by engagement, if the CSV carried
    timestamp data; otherwise a documented industry-default fallback."""
    if df is None or df.empty:
        return {
            "day": "Saturday",
            "time": "18:00",
            "basis": "default",
            "note": "No competitor engagement data was available, so this is a general wedding-industry default.",
        }
    has_day = df["day_of_week"].notna().any()
    has_hour = df["hour"].notna().any()

    if not has_day and not has_hour:
        return {
            "day": "Saturday",
            "time": "18:00",
            "basis": "default",
            "note": (
                "Your CSV didn't include a date/time column, so this is a general "
                "wedding-industry default rather than something computed from your "
                "data. Add a 'posted_at' (or 'day' + 'hour') column to get a "
                "data-driven recommendation."
            ),
        }

    valid = df.dropna(subset=[c for c in ["day_of_week"] if has_day] + [c for c in ["hour"] if has_hour])
    if valid.empty:
        return {
            "day": "Saturday", "time": "18:00", "basis": "default",
            "note": "Timestamp column was present but unparseable — using a general default.",
        }

    if has_day and has_hour:
        grouped = valid.groupby(["day_of_week", "hour"])["weighted_engagement"].sum()
        day_idx, hour = grouped.idxmax()
        return {
            "day": DAY_NAMES[int(day_idx)],
            "time": f"{int(hour):02d}:00",
            "basis": "data",
            "note": "Computed from the day/hour of your highest-engagement competitor posts.",
        }
    elif has_day:
        grouped = valid.groupby("day_of_week")["weighted_engagement"].sum()
        day_idx = grouped.idxmax()
        return {
            "day": DAY_NAMES[int(day_idx)], "time": "18:00", "basis": "data-partial",
            "note": "Only day-of-week data was available; time defaults to a common evening slot.",
        }
    else:
        grouped = valid.groupby("hour")["weighted_engagement"].sum()
        hour = grouped.idxmax()
        return {
            "day": "Saturday", "time": f"{int(hour):02d}:00", "basis": "data-partial",
            "note": "Only hour-of-day data was available; day defaults to Saturday.",
        }
