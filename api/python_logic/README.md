# OCR Python Logic Layer

`ocr_postprocess.py` adds a validation and quality layer on top of OCR output.

## What it does
- Validates upload metadata (filename, mime type, file size).
- Normalizes OCR text (line breaks, extra whitespace cleanup).
- **Script detection:** primary script (Latin, Cyrillic, Arabic, CJK, etc.) and mixed-script flag for translation/workflow hints.
- Computes quality metrics and a quality status (`pass` / `warn` / `fail`).
- Returns recommendations when OCR output looks noisy.

## Output shape (enriched payload)
- `uploadValidation`: `{ valid, errors }`
- `normalizedText`: cleaned text
- `quality`: `{ status, score, warnings, suggestions, metrics }`
- **`script`**: `{ primaryScript, isMixedScript, scriptBreakdown }` — e.g. `primaryScript: "Latin"`, `scriptBreakdown: { "Latin": 95.2, "Common": 4.8 }`

## Run locally

```bash
python ocr_postprocess.py --input sample.json
```

Or pipe JSON:

```bash
echo "{\"filename\":\"img.png\",\"contentType\":\"image/png\",\"sizeBytes\":12345,\"text\":\"hello  world\",\"confidence\":88}" | python ocr_postprocess.py
```

## Suggested integration with your Node API
- Call this Python script after OCR and before saving to DynamoDB.
- Store `quality.status`, `quality.score`, and `quality.warnings` in the job record.
- Reject or flag jobs with `quality.status == "fail"` for manual review.
- Use `script.primaryScript` / `script.isMixedScript` for routing (e.g. translation language, splitting by script).

## More ideas you could add
- **Language hint / detection:** Use a small library or heuristic (e.g. common words, script + n-grams) to suggest language (en, de, ar, etc.) for downstream translation.
- **Readability / complexity:** Simple scores (e.g. avg word length, sentence length) to flag very dense or very sparse text for UX or pricing tiers.
- **PII detection:** Pattern-based checks (emails, phone numbers, IDs) to warn or redact before storing or sending to third parties.
- **Duplicate / near-duplicate detection:** Hash or fingerprint of normalized text to detect repeated uploads and suggest “already processed” or deduplication.
- **Structure hints:** Detect lists (bullets, numbers), headings (short lines, caps), or tables (grid-like spacing) and return a light structure (e.g. `hasLists`, `lineCount`) for downstream formatting.
