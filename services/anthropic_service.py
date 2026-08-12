"""
All Anthropic API calls: competitor-post style extraction + synthesis,
per-photo scoring against the resulting style profile, and caption/hashtag/
alt-text generation. Every call uses structured outputs (output_config.format)
so responses are parsed as validated JSON rather than regex'd out of prose.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import anthropic

from services.image_utils import prepare_image_for_vision

MODEL = "claude-opus-5"


class AnthropicConfigError(Exception):
    pass


def get_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise AnthropicConfigError("ANTHROPIC_API_KEY is not set. Save it on the Settings page first.")
    return anthropic.Anthropic(api_key=api_key)


def _vision_message(image_path: Path, text: str) -> list[dict]:
    data, media_type = prepare_image_for_vision(image_path)
    return [{
        "role": "user",
        "content": [
            {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}},
            {"type": "text", "text": text},
        ],
    }]


def _structured_call(messages: list[dict], schema: dict, max_tokens: int, effort: str) -> dict:
    client = get_client()
    response = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
        messages=messages,
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("The model declined this request (safety refusal).")
    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        raise RuntimeError("No text response returned from the model.")
    return json.loads(text)


# --- Style analysis ------------------------------------------------------

_IMAGE_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "composition": {"type": "string", "description": "Framing, angle, subject placement, use of negative space"},
        "color_grading": {"type": "string", "description": "Tone, warmth, saturation, contrast style"},
        "moment_type": {"type": "string", "description": "e.g. candid emotion, posed portrait, detail shot, group shot, first look"},
        "caption_tone": {"type": "string", "description": "Tone/voice of the caption, if one was provided"},
        "caption_hashtags": {"type": "array", "items": {"type": "string"}, "description": "Hashtags found in the caption, if any"},
    },
    "required": ["composition", "color_grading", "moment_type", "caption_tone", "caption_hashtags"],
    "additionalProperties": False,
}

_STYLE_PROFILE_SCHEMA = {
    "type": "object",
    "properties": {
        "composition_style": {"type": "string", "description": "2-4 sentence summary of the dominant, recurring composition patterns"},
        "color_grading": {"type": "string", "description": "2-4 sentence summary of the recurring color grade / tone"},
        "moment_types": {"type": "array", "items": {"type": "string"}, "description": "The recurring types of moments that perform well"},
        "caption_tone": {"type": "string", "description": "2-3 sentence summary of the caption voice/tone"},
        "caption_length": {"type": "string", "description": "Typical caption length, e.g. 'short, 1-2 sentences' or 'long, storytelling paragraph'"},
        "common_hashtags": {"type": "array", "items": {"type": "string"}, "description": "Hashtags that recur across the top-performing posts"},
        "summary": {"type": "string", "description": "A 2-3 sentence plain-English overview of this account's winning style, for a human to read"},
    },
    "required": [
        "composition_style", "color_grading", "moment_types", "caption_tone",
        "caption_length", "common_hashtags", "summary",
    ],
    "additionalProperties": False,
}


def analyze_competitor_image(image_path: Path, caption: str) -> dict:
    prompt = (
        "This is a top-performing wedding/engagement photography social post. "
        "Analyze its visual style for a style guide that will be used to score "
        "and select photos from a different shoot.\n\n"
        f"The post's caption (may be empty): {caption!r}\n\n"
        "Extract composition, color grading, the type of moment captured, the "
        "tone of the caption, and any hashtags in it."
    )
    return _structured_call(
        _vision_message(image_path, prompt), _IMAGE_ANALYSIS_SCHEMA, max_tokens=1200, effort="low",
    )


def synthesize_style_profile(per_image_results: list[dict], post_count: int) -> dict:
    digest = json.dumps(per_image_results, indent=2)
    prompt = (
        f"Below are per-post visual/caption analyses of the top {post_count} "
        "highest-engagement posts from a wedding photography competitor account "
        "(top 20% by weighted engagement). Synthesize these into ONE overall "
        "style profile describing what this account's best-performing content "
        "has in common — composition, color grading, the moments that resonate, "
        "and caption tone/length/hashtags. This profile will be used to score "
        "and select photos from an unrelated wedding shoot, and to write "
        "matching captions.\n\n"
        f"Per-post analyses:\n{digest}"
    )
    messages = [{"role": "user", "content": prompt}]
    return _structured_call(messages, _STYLE_PROFILE_SCHEMA, max_tokens=2000, effort="medium")


# --- Photo scoring ---------------------------------------------------------

_SCORE_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer", "description": "Overall quality/fit score from 1 (skip) to 10 (must post)"},
        "reasoning": {"type": "string", "description": "2-4 sentence explanation referencing both technical quality and fit with the style profile"},
    },
    "required": ["score", "reasoning"],
    "additionalProperties": False,
}


def score_photo(image_path: Path, style_profile: dict, technical: dict) -> dict:
    tech_notes = []
    if technical.get("is_blurry"):
        tech_notes.append(f"technically blurry (sharpness score {technical['blur_variance']})")
    if technical.get("is_underexposed"):
        tech_notes.append("underexposed")
    if technical.get("is_overexposed"):
        tech_notes.append("overexposed")
    if technical.get("faces_detected"):
        ratio = technical.get("eyes_open_ratio")
        tech_notes.append(
            f"{technical['faces_detected']} face(s) detected, "
            f"eyes-open on ~{int((ratio or 0) * 100)}% of them"
        )
    tech_summary = "; ".join(tech_notes) if tech_notes else "no technical issues flagged"

    prompt = (
        "Score this wedding photo for social-media posting, from 1 (skip) to "
        "10 (must post), by weighing BOTH:\n"
        "1) Technical quality — automated checks found: " + tech_summary + ".\n"
        "2) Fit with this brand's proven style profile:\n"
        f"{json.dumps(style_profile, indent=2)}\n\n"
        "A technically perfect but generic/off-brand photo should score lower "
        "than a slightly imperfect photo that captures a great, on-brand moment. "
        "A severely blurry or badly exposed photo should score low regardless of "
        "moment. Give a specific reason, not generic praise."
    )
    return _structured_call(
        _vision_message(image_path, prompt), _SCORE_SCHEMA, max_tokens=1000, effort="low",
    )


# --- Caption generation -----------------------------------------------------

_CAPTION_SCHEMA = {
    "type": "object",
    "properties": {
        "caption": {"type": "string", "description": "A ready-to-post caption matching the style profile's tone and length"},
        "hashtags": {"type": "array", "items": {"type": "string"}, "description": "5-10 relevant hashtags, each starting with #"},
        "alt_text": {"type": "string", "description": "Concise, descriptive alt text for accessibility (1-2 sentences, no hashtags)"},
    },
    "required": ["caption", "hashtags", "alt_text"],
    "additionalProperties": False,
}


def generate_caption(image_path: Path, style_profile: dict, score_reasoning: Optional[str]) -> dict:
    prompt = (
        "Write a social-media caption, hashtag set, and alt text for this "
        "selected wedding photo, matching this brand's proven style profile:\n"
        f"{json.dumps(style_profile, indent=2)}\n\n"
        + (f"Why this photo was selected: {score_reasoning}\n\n" if score_reasoning else "")
        + "Requirements:\n"
        "- Caption tone and length must match caption_tone / caption_length above.\n"
        "- Provide 5 to 10 relevant hashtags (include ones from common_hashtags "
        "where they genuinely fit, plus a few specific to this photo).\n"
        "- Alt text should describe what's actually visible, for screen readers — "
        "no hashtags, no marketing language."
    )
    return _structured_call(
        _vision_message(image_path, prompt), _CAPTION_SCHEMA, max_tokens=1000, effort="low",
    )
