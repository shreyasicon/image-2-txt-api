/**
 * OCR post-processing and validation (Node.js port of ocr_postprocess.py).
 * Returns uploadValidation, quality, and script for API responses.
 */

const fs = require("fs");
const path = require("path");

function toTerm(s) {
    return String(s || "").trim().toLowerCase().replace(/_/g, " ");
}

const CATEGORY_DISPLAY_NAMES = {
    "1_identity_core": "Identity",
    "2_government_ids": "Government ID",
    "3_date_of_birth_and_demographics": "Demographics",
    "4_contact_information": "Contact information",
    "5_financial_information": "Financial",
    "6_medical_health": "Medical / health",
    "7_employment_education": "Employment / education",
    "8_digital_identifiers": "Digital / credentials",
    "9_vehicle_property": "Vehicle / property",
    "10_biometric_physical": "Biometric",
    "11_legal_criminal": "Legal / criminal",
    "12_dates_and_events": "Dates / events",
    "13_family_relationships": "Family / relationships"
};

function loadPiiReference() {
    const pathsToTry = [
        path.join(__dirname, "pii_entities_reference.json"),
        path.join(process.cwd(), "pii_entities_reference.json"),
        path.join(process.cwd(), "lambda-code", "pii_entities_reference.json")
    ];
    for (const filePath of pathsToTry) {
        try {
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, "utf8");
                const data = JSON.parse(raw);
                const categories = data.pii_categories;
                if (!categories || typeof categories !== "object") return null;
                const words = [];
                const termToCategory = {};
                for (const [catKey, cat] of Object.entries(categories)) {
                    const displayName = CATEGORY_DISPLAY_NAMES[catKey] || catKey.replace(/\d+_/, "").replace(/_/g, " ");
                    const entities = cat.entities;
                    if (!Array.isArray(entities)) continue;
                    for (const entity of entities) {
                        const field = entity.field;
                        const aliases = entity.aliases || [];
                        const fieldTerm = toTerm(field);
                        if (fieldTerm) {
                            words.push(fieldTerm);
                            termToCategory[fieldTerm] = displayName;
                        }
                        for (const a of aliases) {
                            const t = toTerm(a);
                            if (t) {
                                words.push(t);
                                termToCategory[t] = displayName;
                            }
                        }
                    }
                }
                const unique = [...new Set(words)];
                if (!unique.includes("@")) {
                    unique.push("@");
                    termToCategory["@"] = "Contact information";
                }
                if (unique.length > 0) return { words: unique, termToCategory };
            }
        } catch (_) { /* try next path */ }
    }
    return null;
}

// Default blocklist when no file is found.
const DEFAULT_BLOCKED_WORDS = ["@", "email", "e-mail", "credit card", "card holder", "visa", "mastercard", "ssn", "billing address", "card number", "expires", "send receipt"];

let BLOCKED_WORDS;
let TERM_TO_CATEGORY;

(function initBlocklist() {
    const pii = loadPiiReference();
    if (pii && pii.words.length > 0) {
        BLOCKED_WORDS = pii.words;
        TERM_TO_CATEGORY = pii.termToCategory;
        if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
            console.log("[ocr-postprocess] Using PII blocklist from pii_entities_reference.json (" + BLOCKED_WORDS.length + " terms).");
        }
    } else {
        const pathsToTry = [
            path.join(__dirname, "blocked-words.txt"),
            path.join(process.cwd(), "blocked-words.txt"),
            path.join(process.cwd(), "lambda-code", "blocked-words.txt")
        ];
        for (const filePath of pathsToTry) {
            try {
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, "utf8");
                    const words = content
                        .split(/\r?\n/)
                        .map(s => s.trim().toLowerCase())
                        .filter(line => line && !line.startsWith("#"));
                    if (words.length > 0) {
                        BLOCKED_WORDS = words;
                        break;
                    }
                }
            } catch (_) { /* try next */ }
        }
        if (!BLOCKED_WORDS || BLOCKED_WORDS.length === 0) {
            if (!process.env.AWS_LAMBDA_FUNCTION_NAME) console.warn("[ocr-postprocess] No blocklist file found, using default.");
            BLOCKED_WORDS = DEFAULT_BLOCKED_WORDS;
        }
        TERM_TO_CATEGORY = {
            "@": "Email", "email": "Email", "e-mail": "Email", "email address": "Email",
            "credit card": "Card details", "creditcard": "Card details", "card holder": "Card details", "cardholder": "Card details",
            "visa": "Card details", "mastercard": "Card details", "amex": "Card details", "discover": "Card details",
            "cvv": "Card details", "cvc": "Card details", "card number": "Card details", "expires": "Card details",
            "expiry": "Card details", "expiration date": "Card details", "security code": "Card details",
            "debit": "Card details", "debit card": "Card details",
            "ssn": "Account / ID", "social security": "Account / ID", "social security number": "Account / ID",
            "account number": "Account / ID", "routing number": "Account / ID", "iban": "Account / ID", "swift": "Account / ID",
            "tax id": "Account / ID", "tax identification": "Account / ID", "ein": "Account / ID", "tin": "Account / ID",
            "drivers license": "Account / ID", "driver license": "Account / ID", "license number": "Account / ID",
            "passport": "Account / ID", "passport number": "Account / ID", "state id": "Account / ID",
            "billing address": "Billing / transaction", "send receipt": "Billing / transaction", "billing": "Billing / transaction",
            "address": "Personal / contact", "street address": "Personal / contact", "street": "Personal / contact",
            "bank account": "Account / ID", "checking account": "Account / ID", "savings account": "Account / ID",
            "date of birth": "Personal / contact", "birth date": "Personal / contact", "birthday": "Personal / contact",
            "first name": "Personal / contact", "last name": "Personal / contact", "maiden name": "Personal / contact",
            "phone": "Phone number", "phone number": "Phone number", "telephone": "Phone number",
            "mobile": "Phone number", "mobile number": "Phone number",
            "password": "Credentials / secrets", "secret": "Credentials / secrets", "token": "Credentials / secrets",
            "reset token": "Credentials / secrets", "cookie": "Credentials / secrets",
            "ip address": "Credentials / secrets", "ip": "Credentials / secrets", "mac address": "Credentials / secrets",
            "employer id": "Account / ID", "employer id number": "Account / ID", "auth id": "Credentials / secrets"
        };
    }
})();

const SENSITIVE_TERMS = BLOCKED_WORDS;

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp", ".gif", ".pdf"]);
const ALLOWED_CONTENT_TYPES = new Set([
    "image/jpeg", "image/png", "image/bmp", "image/tiff",
    "image/webp", "image/gif", "application/pdf"
]);
const DEFAULT_MAX_SIZE_MB = 10;

// [start, end, name] - order matters (first match wins)
const SCRIPT_RANGES = [
    [0x0370, 0x03FF, "Greek"],
    [0x0400, 0x04FF, "Cyrillic"],
    [0x0500, 0x052F, "Cyrillic"],
    [0x0530, 0x058F, "Armenian"],
    [0x0590, 0x05FF, "Hebrew"],
    [0x0600, 0x06FF, "Arabic"],
    [0x0750, 0x077F, "Arabic"],
    [0x0780, 0x07BF, "Thaana"],
    [0x0900, 0x097F, "Devanagari"],
    [0x0980, 0x09FF, "Bengali"],
    [0x0A00, 0x0A7F, "Gurmukhi"],
    [0x0A80, 0x0AFF, "Gujarati"],
    [0x0B00, 0x0B7F, "Oriya"],
    [0x0B80, 0x0BFF, "Tamil"],
    [0x0C00, 0x0C7F, "Telugu"],
    [0x0C80, 0x0CFF, "Kannada"],
    [0x0D00, 0x0D7F, "Malayalam"],
    [0x0E00, 0x0E7F, "Thai"],
    [0x4E00, 0x9FFF, "CJK"],
    [0x3040, 0x309F, "Hiragana"],
    [0x30A0, 0x30FF, "Katakana"],
    [0xAC00, 0xD7AF, "Hangul"],
    [0x0000, 0x024F, "Latin"],
    [0x1E00, 0x1EFF, "Latin"],
    [0x2000, 0x206F, "Common"]
];

function getScript(c) {
    if (!c || !c.trim()) return "Common";
    const o = c.codePointAt(0);
    for (const [start, end, name] of SCRIPT_RANGES) {
        if (o >= start && o <= end) return name;
    }
    return "Other";
}

function scriptAnalysis(text) {
    if (!text || !String(text).trim()) {
        return { primaryScript: null, isMixedScript: false, scriptBreakdown: {} };
    }
    const counts = {};
    const str = String(text);
    for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (/\s/.test(c) || !c.trim()) continue;
        const script = getScript(c);
        counts[script] = (counts[script] || 0) + 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) {
        return { primaryScript: null, isMixedScript: false, scriptBreakdown: {} };
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const scriptBreakdown = {};
    entries.forEach(([k, v]) => { scriptBreakdown[k] = Math.round(100 * v / total * 10) / 10; });
    const primaryScript = entries[0][0];
    const nonCommon = Object.entries(counts).filter(([k]) => k !== "Common");
    const threshold = 0.10 * total;
    const significant = nonCommon.filter(([, v]) => v >= threshold).length;
    const isMixedScript = significant >= 2;
    return { primaryScript, isMixedScript, scriptBreakdown };
}

function validateUploadMetadata(filename, contentType, sizeBytes, maxSizeMb = DEFAULT_MAX_SIZE_MB) {
    const errors = [];
    const ext = path.extname(filename || "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
        errors.push(`Unsupported file extension: ${ext || "(missing)"}`);
    }
    if (!ALLOWED_CONTENT_TYPES.has((contentType || "").toLowerCase())) {
        errors.push(`Unsupported content type: ${contentType || "(missing)"}`);
    }
    const maxBytes = maxSizeMb * 1024 * 1024;
    if (sizeBytes <= 0) {
        errors.push("File size must be greater than 0 bytes");
    } else if (sizeBytes > maxBytes) {
        errors.push(`File exceeds max size (${maxSizeMb}MB)`);
    }
    return { valid: errors.length === 0, errors };
}

function normalizeOcrText(text) {
    let t = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = t.split("\n").map(l => l.replace(/\s+$/, ""));
    t = lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
    return t.trim();
}

function safeRatio(num, den) {
    return den <= 0 ? 0 : Math.round((num / den) * 10000) / 10000;
}

function buildQualityMetrics(text, confidence) {
    const str = String(text || "");
    const charCount = str.length;
    const words = str.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    let alphaCount = 0, digitCount = 0, printableCount = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str[i];
        const code = c.codePointAt(0);
        if (typeof code === "number") {
            if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A) || (code >= 0xC0 && code <= 0x024F) || (code >= 0x1E00 && code <= 0x1EFF)) alphaCount++;
            if (code >= 0x30 && code <= 0x39) digitCount++;
            // Python isprintable(): not control (0-0x1F, 0x7F-0x9F)
            if (code >= 0x20 && code !== 0x7F && (code < 0x80 || code > 0x9F)) printableCount++;
        }
    }
    const nonPrintableRatio = charCount ? Math.round((1 - safeRatio(printableCount, charCount)) * 10000) / 10000 : 0;
    const repeatedStreaks = (str.match(/(.)\1{3,}/g) || []).length;
    return {
        charCount,
        wordCount,
        alphaRatio: safeRatio(alphaCount, charCount),
        digitRatio: safeRatio(digitCount, charCount),
        nonPrintableRatio,
        repeatedStreaks,
        confidence: confidence != null ? Number(confidence) : null
    };
}

function assessQuality(metrics) {
    const warnings = [];
    const suggestions = [];
    let score = 100;
    const confidence = metrics.confidence;
    const charCount = Math.floor(Number(metrics.charCount) || 0);
    const wordCount = Math.floor(Number(metrics.wordCount) || 0);
    const alphaRatio = Number(metrics.alphaRatio) || 0;
    const nonPrintableRatio = Number(metrics.nonPrintableRatio) || 0;
    const repeatedStreaks = Math.floor(Number(metrics.repeatedStreaks) || 0);

    if (confidence != null && confidence < 65) {
        warnings.push("Low OCR confidence");
        suggestions.push("Try a clearer image (higher contrast, less blur, better lighting).");
        score -= 25;
    } else if (confidence != null && confidence < 80) {
        warnings.push("Moderate OCR confidence");
        suggestions.push("Consider image preprocessing (grayscale, sharpen, resize).");
        score -= 10;
    }
    if (charCount < 8 || wordCount < 2) {
        warnings.push("Very short extracted content");
        suggestions.push("Ensure the image contains readable text and correct orientation.");
        score -= 20;
    }
    if (alphaRatio < 0.25 && wordCount > 3) {
        warnings.push("Low alphabetic ratio; output may be noisy");
        suggestions.push("If the document is not numeric, re-run OCR with improved quality.");
        score -= 15;
    }
    if (nonPrintableRatio > 0.01) {
        warnings.push("Contains non-printable characters");
        suggestions.push("Apply post-cleaning or rerun OCR.");
        score -= 10;
    }
    if (repeatedStreaks > 2) {
        warnings.push("Repeated character noise detected");
        suggestions.push("Try denoise + contrast enhancement before OCR.");
        score -= 10;
    }
    score = Math.max(0, Math.min(100, score));
    const status = score >= 80 ? "pass" : score >= 55 ? "warn" : "fail";
    return {
        status,
        score,
        warnings,
        suggestions,
        metrics
    };
}

// TERM_TO_CATEGORY is set in initBlocklist (from PII reference or fallback map).
const TYPE_TO_CATEGORY = {
    email: "Email",
    credit_card: "Card details",
    ssn: "Account / ID",
    phone: "Phone number",
    blocked_keyword: null
};

function getUniqueCategories(types, matchedTerms) {
    const set = new Set();
    if (types) types.forEach(t => { const c = TYPE_TO_CATEGORY[t]; if (c) set.add(c); });
    if (matchedTerms) matchedTerms.forEach(t => { const c = TERM_TO_CATEGORY[t.toLowerCase()]; if (c) set.add(c); });
    return Array.from(set).sort();
}

/**
 * If extracted text contains ANY word/phrase from blocked-words.txt, return blocked + categories.
 * When blocked, API returns "Extracted text cannot be displayed" and reason (categories).
 */
function checkBlockedWords(text) {
    const raw = String(text || "").trim().toLowerCase();
    if (!raw || BLOCKED_WORDS.length === 0) return { blocked: false };
    const matched = [];
    for (const word of BLOCKED_WORDS) {
        if (word && raw.includes(word)) matched.push(word);
    }
    if (matched.length === 0) return { blocked: false };
    let categories = getUniqueCategories([], matched);
    if (categories.length === 0) categories = ["Blocked content"];
    return { blocked: true, categories };
}

/**
 * Normalize OCR text for sensitivity matching: collapse spaces around @ and . so
 * "john . smith @ rockstartherapy . com" becomes "john.smith@rockstartherapy.com"
 */
function normalizeForSensitivityCheck(text) {
    return String(text || "")
        .replace(/\s*\.\s*/g, ".")
        .replace(/\s*@\s*/g, "@")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Check for sensitive/PII content. If found, extraction should be prohibited.
 * Uses: email/phone/SSN/card regexes (on raw + normalized text) and denylist from sensitive-terms.txt.
 * @param {string} text - OCR-extracted text
 * @returns {{ sensitive: boolean, reason?: string, types?: string[], matchedTerms?: string[] }}
 */
function checkSensitivity(text) {
    const raw = String(text || "").trim();
    if (!raw) return { sensitive: false };

    const normalized = normalizeForSensitivityCheck(raw);
    const rawLower = raw.toLowerCase();
    const types = [];
    const matchedTerms = [];

    // ----- FAILSAFE: any @ in text = block (emails always contain @) -----
    if (raw.includes("@")) {
        types.push("email");
        matchedTerms.push("@");
    }

    // ----- Email patterns (on raw and normalized) -----
    const emailPatterns = [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
        /[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}/,
        /\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Za-z]{2,}\b/
    ];
    const toTest = [raw, normalized];
    if (toTest.some(s => emailPatterns.some(p => p.test(s)))) types.push("email");
    if (raw.includes("@") && /\.(com|org|net|edu|gov|co\.uk|io|email)\b/i.test(raw)) types.push("email");

    // ----- SSN -----
    if (/\d{3}[-\s]?\d{2}[-\s]?\d{4}/.test(raw)) types.push("ssn");

    // ----- Credit card (4 groups of 4 digits, optional space/dash) -----
    if (/\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/.test(raw)) types.push("credit_card");

    // ----- Phone: 10+ digits with optional separators, or 10+ consecutive digits -----
    const digitsOnly = raw.replace(/\D/g, "");
    if (/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(raw) || /\d{10,}/.test(digitsOnly)) types.push("phone");

    // ----- Denylist from sensitive-terms.txt (substring match, case-insensitive) -----
    for (const term of SENSITIVE_TERMS) {
        if (term && rawLower.includes(term)) matchedTerms.push(term);
    }
    if (matchedTerms.length) types.push("blocked_keyword");

    if (types.length === 0) return { sensitive: false };
    return {
        sensitive: true,
        reason: "Sensitive or prohibited content detected (e.g. email, SSN, phone, credit card, or blocked keywords). Extraction blocked.",
        types: [...new Set(types)],
        matchedTerms: [...new Set(matchedTerms)]
    };
}

/**
 * Enrich OCR result with validation, quality, and script.
 * @param {object} payload - { filename, contentType, sizeBytes, text, confidence }
 * @returns {object} - { uploadValidation, normalizedText, quality, script, original }
 */
function validateAndEnrichOcrPayload(payload) {
    const filename = String(payload.filename || "");
    const contentType = String(payload.contentType || "");
    const sizeBytes = Math.floor(Number(payload.sizeBytes) || 0);
    const text = String(payload.text || "");
    const confidence = payload.confidence != null ? Number(payload.confidence) : null;

    const uploadValidation = validateUploadMetadata(filename, contentType, sizeBytes);
    const normalizedText = normalizeOcrText(text);
    const metrics = buildQualityMetrics(normalizedText, confidence);
    let quality = assessQuality(metrics);
    const script = scriptAnalysis(normalizedText);

    if (script.isMixedScript) {
        quality = {
            ...quality,
            warnings: [...quality.warnings, "Mixed scripts detected"],
            suggestions: [...quality.suggestions, "Consider splitting by script for translation or language-specific processing."]
        };
    }

    const { nonPrintableRatio, repeatedStreaks, ...metricsOut } = quality.metrics || {};
    quality = { ...quality, metrics: metricsOut };

    return {
        uploadValidation,
        normalizedText,
        quality,
        script,
        original: { filename, contentType, sizeBytes, confidence }
    };
}

module.exports = { validateAndEnrichOcrPayload, checkSensitivity, checkBlockedWords, getUniqueCategories, scriptAnalysis, validateUploadMetadata, buildQualityMetrics, assessQuality, normalizeOcrText };
