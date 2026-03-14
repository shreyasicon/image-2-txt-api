"""
OCR post-processing and validation utilities.

Purpose:
- Validate upload metadata (filename/type/size).
- Normalize extracted OCR text.
- Compute quality metrics and recommendations.
- Return an enriched, API-friendly result payload.

This module is intentionally stdlib-only for easy usage in Lambda containers,
batch jobs, or local scripts.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import argparse
import json
import re


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/jpg",
}
DEFAULT_MAX_SIZE_MB = 5

# Unicode codepoint ranges → script name (for primary/mixed script detection).
# Order matters: first match wins. Ranges are (start, end_inclusive, name).
_SCRIPT_RANGES: List[Tuple[int, int, str]] = [
    (0x0370, 0x03FF, "Greek"),
    (0x0400, 0x04FF, "Cyrillic"),
    (0x0500, 0x052F, "Cyrillic"),
    (0x0530, 0x058F, "Armenian"),
    (0x0590, 0x05FF, "Hebrew"),
    (0x0600, 0x06FF, "Arabic"),
    (0x0750, 0x077F, "Arabic"),
    (0x0780, 0x07BF, "Thaana"),
    (0x0900, 0x097F, "Devanagari"),
    (0x0980, 0x09FF, "Bengali"),
    (0x0A00, 0x0A7F, "Gurmukhi"),
    (0x0A80, 0x0AFF, "Gujarati"),
    (0x0B00, 0x0B7F, "Oriya"),
    (0x0B80, 0x0BFF, "Tamil"),
    (0x0C00, 0x0C7F, "Telugu"),
    (0x0C80, 0x0CFF, "Kannada"),
    (0x0D00, 0x0D7F, "Malayalam"),
    (0x0E00, 0x0E7F, "Thai"),
    (0x4E00, 0x9FFF, "CJK"),
    (0x3040, 0x309F, "Hiragana"),
    (0x30A0, 0x30FF, "Katakana"),
    (0xAC00, 0xD7AF, "Hangul"),
    (0x0000, 0x024F, "Latin"),  # Basic Latin + Latin-1 Supplement + Extended-A
    (0x1E00, 0x1EFF, "Latin"),  # Latin Extended Additional
    (0x2000, 0x206F, "Common"),  # Punctuation, spaces
]


def _get_script(c: str) -> str:
    if not c.strip():
        return "Common"
    o = ord(c)
    for start, end, name in _SCRIPT_RANGES:
        if start <= o <= end:
            return name
    return "Other"


def script_analysis(text: str) -> Dict[str, Any]:
    """
    Detect primary script and whether text is mixed-script.
    Useful for translation: e.g. primaryScript hints source language, isMixedScript suggests splitting.
    """
    if not text or not text.strip():
        return {"primaryScript": None, "isMixedScript": False, "scriptBreakdown": {}}

    counts: Dict[str, int] = {}
    for c in text:
        if c.isspace() or not c.strip():
            continue
        script = _get_script(c)
        counts[script] = counts.get(script, 0) + 1

    total = sum(counts.values())
    if total == 0:
        return {"primaryScript": None, "isMixedScript": False, "scriptBreakdown": {}}

    breakdown = {k: round(100 * v / total, 1) for k, v in sorted(counts.items(), key=lambda x: -x[1])}
    primary = max(counts, key=counts.get)
    # Mixed if more than one script has at least 10% of (non-Common) characters
    non_common = {k: v for k, v in counts.items() if k != "Common"}
    if len(non_common) < 2:
        is_mixed = False
    else:
        threshold = 0.10 * total
        significant = sum(1 for v in non_common.values() if v >= threshold)
        is_mixed = significant >= 2

    return {
        "primaryScript": primary,
        "isMixedScript": is_mixed,
        "scriptBreakdown": breakdown,
    }


@dataclass
class UploadValidation:
    valid: bool
    errors: List[str]

@dataclass
class OCRQuality:
    status: str
    score: int
    warnings: List[str]
    suggestions: List[str]
    metrics: Dict[str, Any]

def validate_upload_metadata(
    filename: str,
    content_type: str,
    size_bytes: int,
    max_size_mb: int = DEFAULT_MAX_SIZE_MB,
) -> UploadValidation:
    errors: List[str] = []

    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        errors.append(f"Unsupported file extension: {ext or '(missing)'}")

    if content_type not in ALLOWED_CONTENT_TYPES:
        errors.append(f"Unsupported content type: {content_type or '(missing)'}")

    max_bytes = max_size_mb * 1024 * 1024
    if size_bytes <= 0:
        errors.append("File size must be greater than 0 bytes")
    elif size_bytes > max_bytes:
        errors.append(f"File exceeds max size ({max_size_mb}MB)")

    return UploadValidation(valid=len(errors) == 0, errors=errors)

def normalize_ocr_text(text: str) -> str:
    # Normalize line endings and trim trailing spaces per line.
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in text.split("\n")]

    # Collapse too many blank lines.
    joined = "\n".join(lines)
    joined = re.sub(r"\n{3,}", "\n\n", joined)

    # Collapse repeated spaces/tabs while preserving line breaks.
    joined = re.sub(r"[ \t]{2,}", " ", joined)
    return joined.strip()

def _safe_ratio(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round(numerator / denominator, 4)

def build_quality_metrics(text: str, confidence: Optional[float]) -> Dict[str, Any]:
    char_count = len(text)
    words = [w for w in re.split(r"\s+", text) if w]
    word_count = len(words)

    alpha_count = sum(1 for c in text if c.isalpha())
    digit_count = sum(1 for c in text if c.isdigit())
    printable_count = sum(1 for c in text if c.isprintable())

    # Consecutive repeated chars often indicate OCR noise: e.g. "lllll", "~~~~".
    repeated_streaks = len(re.findall(r"(.)\1{3,}", text))

    return {
        "charCount": char_count,
        "wordCount": word_count,
        "alphaRatio": _safe_ratio(alpha_count, char_count),
        "digitRatio": _safe_ratio(digit_count, char_count),
        "nonPrintableRatio": round(1 - _safe_ratio(printable_count, char_count), 4) if char_count else 0.0,
        "repeatedStreaks": repeated_streaks,
        "confidence": confidence,
    }

def assess_quality(metrics: Dict[str, Any]) -> OCRQuality:
    warnings: List[str] = []
    suggestions: List[str] = []
    score = 100

    confidence = metrics.get("confidence")
    char_count = int(metrics.get("charCount", 0))
    word_count = int(metrics.get("wordCount", 0))
    alpha_ratio = float(metrics.get("alphaRatio", 0.0))
    non_printable_ratio = float(metrics.get("nonPrintableRatio", 0.0))
    repeated_streaks = int(metrics.get("repeatedStreaks", 0))

    if confidence is not None and confidence < 65:
        warnings.append("Low OCR confidence")
        suggestions.append("Try a clearer image (higher contrast, less blur, better lighting).")
        score -= 25
    elif confidence is not None and confidence < 80:
        warnings.append("Moderate OCR confidence")
        suggestions.append("Consider image preprocessing (grayscale, sharpen, resize).")
        score -= 10

    if char_count < 8 or word_count < 2:
        warnings.append("Very short extracted content")
        suggestions.append("Ensure the image contains readable text and correct orientation.")
        score -= 20

    if alpha_ratio < 0.25 and word_count > 3:
        warnings.append("Low alphabetic ratio; output may be noisy")
        suggestions.append("If the document is not numeric, re-run OCR with improved quality.")
        score -= 15

    if non_printable_ratio > 0.01:
        warnings.append("Contains non-printable characters")
        suggestions.append("Apply post-cleaning or rerun OCR.")
        score -= 10

    if repeated_streaks > 2:
        warnings.append("Repeated character noise detected")
        suggestions.append("Try denoise + contrast enhancement before OCR.")
        score -= 10

    score = max(0, min(100, score))
    if score >= 80:
        status = "pass"
    elif score >= 55:
        status = "warn"
    else:
        status = "fail"

    return OCRQuality(
        status=status,
        score=score,
        warnings=warnings,
        suggestions=suggestions,
        metrics=metrics,
    )

def validate_and_enrich_ocr_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Expected payload shape:
      {
        "filename": "img.png",
        "contentType": "image/png",
        "sizeBytes": 12345,
        "text": "...",
        "confidence": 92
      }
    """
    filename = str(payload.get("filename", ""))
    content_type = str(payload.get("contentType", ""))
    size_bytes = int(payload.get("sizeBytes", 0))
    text = str(payload.get("text", ""))
    confidence = payload.get("confidence")
    confidence = float(confidence) if confidence is not None else None

    upload_check = validate_upload_metadata(
        filename=filename,
        content_type=content_type,
        size_bytes=size_bytes,
    )
    normalized_text = normalize_ocr_text(text)
    metrics = build_quality_metrics(normalized_text, confidence)
    quality = assess_quality(metrics)
    script_info = script_analysis(normalized_text)
    quality_dict = asdict(quality)
    if script_info.get("isMixedScript"):
        quality_dict["warnings"].append("Mixed scripts detected")
        quality_dict["suggestions"].append(
            "Consider splitting by script for translation or language-specific processing."
        )
    if "metrics" in quality_dict and isinstance(quality_dict["metrics"], dict):
        quality_dict["metrics"] = {k: v for k, v in quality_dict["metrics"].items() if k not in ("nonPrintableRatio", "repeatedStreaks")}

    return {
        "uploadValidation": asdict(upload_check),
        "normalizedText": normalized_text,
        "quality": quality_dict,
        "script": script_info,
        "original": {
            "filename": filename,
            "contentType": content_type,
            "sizeBytes": size_bytes,
            "confidence": confidence,
        },
    }

def main() -> None:
    parser = argparse.ArgumentParser(description="Validate + enrich OCR payload.")
    parser.add_argument(
        "--input",
        type=str,
        default="",
        help="JSON file path. If omitted, reads JSON from stdin.",
    )
    args = parser.parse_args()

    if args.input:
        with open(args.input, "r", encoding="utf-8") as f:
            payload = json.load(f)
    else:
        payload = json.load(__import__("sys").stdin)

    result = validate_and_enrich_ocr_payload(payload)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()