// OCR API (Image to Text) – Lambda base URL for POST /ocr/base64, GET/PUT/DELETE /ocr/:jobId
const DEFAULT_OCR_API_BASE = 'https://xkdvpogqt0.execute-api.us-east-1.amazonaws.com/prod';
const OCR_API_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_OCR_API_BASE) || DEFAULT_OCR_API_BASE;

/** Trim trailing slashes without regex (avoids ReDoS). */
function trimTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}

/** Base URL used for OCR requests (no trailing slash). */
export function getOcrApiBaseUrl(): string {
  return trimTrailingSlashes(OCR_API_BASE || DEFAULT_OCR_API_BASE);
}

/** OCR API endpoint URL (base + /ocr) for display and CORS troubleshooting. */
export function getOcrApiOcrUrl(): string {
  return getOcrApiBaseUrl() + '/ocr';
}

// Text to Multiple Languages API (Translation) – https://wasiullah26.github.io/text-to-languages-api-page/
const DEFAULT_TRANSLATE_API_BASE = 'https://t3jb8c44xi.execute-api.us-east-1.amazonaws.com';
const TRANSLATE_API_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_TRANSLATE_API_BASE) || DEFAULT_TRANSLATE_API_BASE;

const MAX_OCR_IMAGE_SIZE = 6 * 1024 * 1024; // 6MB (keeps payload under API Gateway limit)

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** API returns either { result, data } or the payload at top level */
export interface OCRUploadValidation {
  valid: boolean;
  errors?: string[];
}

export interface OCRQualityMetrics {
  charCount?: number;
  wordCount?: number;
  alphaRatio?: number;
  digitRatio?: number;
  confidence?: number;
  fileType?: string;
}

export interface OCRQuality {
  status?: string;
  score?: number;
  warnings?: string[];
  suggestions?: string[];
  metrics?: OCRQualityMetrics;
}

export interface OCRScript {
  primaryScript?: string;
  isMixedScript?: boolean;
  scriptBreakdown?: Record<string, number>;
  likelyEnglish?: boolean;
}

export interface OCRExtractResult {
  text: string;
  confidence: number;
  success: boolean;
  jobId?: string;
  filename?: string;
  s3Key?: string | null;
  uploadValidation?: OCRUploadValidation;
  quality?: OCRQuality;
  script?: OCRScript;
  error?: string;
  /** Full API response for display */
  raw?: Record<string, unknown>;
}

/** Optional auth: pass getToken (e.g. from useAuth().getIdToken) to link the job to the signed-in user. */
export interface OcrAuthOptions {
  getToken?: () => Promise<string | null>;
}

const OCR_CACHE_PREFIX = 'ocr_result_';
const OCR_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCachedOcrJob(jobId: string): OCRExtractResult | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(OCR_CACHE_PREFIX + jobId);
    if (!raw) return null;
    const { data, at } = JSON.parse(raw) as { data: OCRExtractResult; at: number };
    if (Date.now() - at > OCR_CACHE_TTL_MS) {
      sessionStorage.removeItem(OCR_CACHE_PREFIX + jobId);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedOcrJob(jobId: string, result: OCRExtractResult): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(OCR_CACHE_PREFIX + jobId, JSON.stringify({ data: result, at: Date.now() }));
  } catch (_) {}
}

/** Cache an OCR result client-side (e.g. after sync extract) so getOcrJob and My Uploads can use it. */
export function cacheOcrResult(jobId: string, result: OCRExtractResult): void {
  setCachedOcrJob(jobId, result);
}

/** Fetch a single OCR job by ID (checks client cache first). Use for polling after async submit. */
export async function getOcrJob(
  jobId: string,
  getToken?: () => Promise<string | null>
): Promise<{ jobId: string; filename: string; text: string; confidence: number; status?: string; createdAt?: string; s3Key?: string } | null> {
  const cached = getCachedOcrJob(jobId);
  if (cached && cached.success && cached.jobId) {
    return {
      jobId: cached.jobId,
      filename: cached.filename ?? '',
      text: cached.text,
      confidence: cached.confidence,
      status: 'completed',
    };
  }
  const base = trimTrailingSlashes(OCR_API_BASE || DEFAULT_OCR_API_BASE);
  const headers: Record<string, string> = {};
  if (getToken) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${base}/ocr/${encodeURIComponent(jobId)}`, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const job = {
    jobId: data.jobId ?? jobId,
    filename: data.filename ?? '',
    text: data.text ?? '',
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    status: data.status as string | undefined,
    createdAt: data.createdAt as string | undefined,
    s3Key: data.s3Key as string | undefined,
  };
  if (job.status === 'completed' && job.text) {
    setCachedOcrJob(jobId, {
      text: job.text,
      confidence: job.confidence,
      success: true,
      jobId: job.jobId,
      filename: job.filename,
      s3Key: job.s3Key ?? null,
    });
  }
  return job;
}

/** Poll GET /ocr/:jobId until status is 'completed' or 'failed', or timeout. Uses only the API to fetch; no webapp-side logic. */
export async function pollOcrJobUntilDone(
  jobId: string,
  getToken?: () => Promise<string | null>,
  options?: { intervalMs?: number; maxWaitMs?: number }
): Promise<OCRExtractResult | null> {
  const intervalMs = options?.intervalMs ?? 3000;
  const maxWaitMs = options?.maxWaitMs ?? 300000; // 5 min for SQS consumer to finish
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const job = await getOcrJob(jobId, getToken);
    if (job) {
      if (job.status === 'completed') {
        const result: OCRExtractResult = {
          text: job.text ?? '',
          confidence: job.confidence ?? 0,
          success: true,
          jobId: job.jobId,
          filename: job.filename,
          s3Key: job.s3Key ?? undefined,
        };
        setCachedOcrJob(jobId, result);
        return result;
      }
      if (job.status === 'failed') {
        return {
          text: (job as { text?: string }).text ?? '',
          confidence: 0,
          success: false,
          error: 'Job failed',
        };
      }
    }
    // Job null (e.g. 404/network) or still pending: keep polling, API will have result when SQS consumer is done
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

/** Submit image via SQS (async). Returns jobId and status 'processing'; poll getOcrJob until status is 'completed' or 'failed'. */
export async function extractTextFromImageAsync(
  imageFile: File,
  options?: OcrAuthOptions
): Promise<{ jobId: string; status: string; success: true } | OCRExtractResult> {
  if (imageFile.size > MAX_OCR_IMAGE_SIZE) {
    return {
      text: '',
      confidence: 0,
      success: false,
      error: `Image too large (max ${MAX_OCR_IMAGE_SIZE / 1024 / 1024}MB). Use a smaller file.`,
    };
  }
  const base = trimTrailingSlashes(OCR_API_BASE || DEFAULT_OCR_API_BASE);
  const dataUrl = await readFileAsDataUrl(imageFile);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options?.getToken) {
    const token = await options.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${base}/ocr/base64?async=1`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      image: dataUrl,
      language: 'eng',
      filename: imageFile.name,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (response.status === 202 && json.jobId) {
    return { jobId: json.jobId, status: json.status ?? 'processing', success: true as const };
  }
  if (!response.ok) {
    return {
      text: '',
      confidence: 0,
      success: false,
      error: (json?.message || json?.error || response.statusText) as string || 'Request failed',
    };
  }
  const data = (json?.data && typeof json.data === 'object' ? json.data : json) as Record<string, unknown>;
  return {
    text: (data.text as string) ?? '',
    confidence: typeof data.confidence === 'number' ? data.confidence : 80,
    success: true,
    jobId: data.jobId as string | undefined,
    filename: (data.filename as string) ?? imageFile.name,
    s3Key: data.s3Key as string | null | undefined,
    uploadValidation: data.uploadValidation as OCRUploadValidation | undefined,
    quality: data.quality as OCRQuality | undefined,
    script: data.script as OCRScript | undefined,
    raw: data as Record<string, unknown>,
  };
}

/** Synchronous OCR: POST /ocr/base64 (no async=1, no SQS). Returns immediately with extracted text. Used by webapp for immediate results. */
export async function extractTextFromImage(
  imageFile: File,
  options?: OcrAuthOptions
): Promise<OCRExtractResult> {
  try {
    if (imageFile.size > MAX_OCR_IMAGE_SIZE) {
      return {
        text: '',
        confidence: 0,
        success: false,
        error: `Image too large (max ${MAX_OCR_IMAGE_SIZE / 1024 / 1024}MB). Use a smaller file.`,
      };
    }
    const base = trimTrailingSlashes(OCR_API_BASE || DEFAULT_OCR_API_BASE);
    const dataUrl = await readFileAsDataUrl(imageFile);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options?.getToken) {
      const token = await options.getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${base}/ocr/base64`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image: dataUrl,
        language: 'eng',
        filename: imageFile.name,
      }),
    });

    const json = await response.json().catch(() => ({}));
    const data = (json?.data && typeof json.data === 'object' ? json.data : json) as Record<string, unknown>;

    if (!response.ok) {
      const msg = (json?.message || json?.error || response.statusText) as string || 'Request failed';
      return {
        text: '',
        confidence: 0,
        success: false,
        error: msg,
      };
    }

    const text = (data.text as string) ?? '';
    const confidence = typeof data.confidence === 'number' ? data.confidence : 80;

    return {
      text,
      confidence,
      success: true,
      jobId: data.jobId as string | undefined,
      filename: (data.filename as string) ?? imageFile.name,
      s3Key: data.s3Key as string | null | undefined,
      uploadValidation: data.uploadValidation as OCRUploadValidation | undefined,
      quality: data.quality as OCRQuality | undefined,
      script: data.script as OCRScript | undefined,
      raw: data as Record<string, unknown>,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    const isNetwork = message.includes('fetch') || message.includes('Network') || message === 'Failed to fetch';
    return {
      text: '',
      confidence: 0,
      success: false,
      error: isNetwork
        ? 'Cannot reach the OCR API. Check your connection and that the API is available.'
        : message,
    };
  }
}

/** Normalize confidence to 0–100 for display (API may send 100 or 0–1). */
export function formatConfidence(confidence: number): number {
  if (confidence > 1 && confidence <= 100) return Math.round(confidence);
  if (confidence >= 0 && confidence <= 1) return Math.round(confidence * 100);
  return Math.min(100, Math.max(0, Math.round(confidence)));
}

/** Job summary from GET /ocr?list=mine (requires Cognito token). */
export interface MyOcrJob {
  jobId: string;
  filename: string;
  text: string;
  confidence: number;
  createdAt: string;
  s3Key?: string;
}

/** List current user's OCR jobs. Requires getToken (e.g. useAuth().getIdToken). */
export async function listMyOcrJobs(
  getToken: () => Promise<string | null>
): Promise<{ jobs: MyOcrJob[] } | null> {
  const base = trimTrailingSlashes(OCR_API_BASE || DEFAULT_OCR_API_BASE);
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${base}/ocr?list=mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return { jobs: (data.jobs || []) as MyOcrJob[] };
  } catch {
    return null;
  }
}

/** User S3 link from DynamoDB UserS3Links (user ↔ S3, easy to maintain). */
export interface UserS3Link {
  jobId: string;
  s3Key?: string;
  filename?: string;
  createdAt?: string;
  /** Presigned URL to display the image (from API). */
  previewUrl?: string | null;
}

/** List current user's S3 links (UserS3Links table). Requires getToken. */
export async function listMyS3Links(
  getToken: () => Promise<string | null>
): Promise<{ userId: string; items: UserS3Link[] } | null> {
  const base = trimTrailingSlashes(OCR_API_BASE || DEFAULT_OCR_API_BASE);
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${base}/users/me/s3-links`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return { userId: data.userId, items: (data.items || []) as UserS3Link[] };
  } catch {
    return null;
  }
}

// --- Text to Multiple Languages API (Translation) ---
export interface TranslateResponse {
  original_text: string;
  source_lang: string;
  translations: Record<string, string>;
}

export async function translateText(
  text: string,
  options?: { source_lang?: string; target_languages?: string[] }
): Promise<TranslateResponse | null> {
  try {
    const base = trimTrailingSlashes(TRANSLATE_API_BASE || DEFAULT_TRANSLATE_API_BASE);
    const res = await fetch(`${base}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.trim(),
        ...(options?.source_lang && { source_lang: options.source_lang }),
        ...(options?.target_languages?.length && { target_languages: options.target_languages }),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('Translate API error:', data?.message || data?.error || res.statusText);
      return null;
    }
    return data as TranslateResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Translate API request failed:', msg);
    return null;
  }
}

export async function getTranslateLanguages(): Promise<{ source?: string; target?: string[] } | null> {
  try {
    const base = trimTrailingSlashes(TRANSLATE_API_BASE || DEFAULT_TRANSLATE_API_BASE);
    const res = await fetch(`${base}/languages`);
    const data = await res.json().catch(() => ({}));
    return res.ok ? data : null;
  } catch {
    return null;
  }
}

export async function translateHealth(): Promise<boolean> {
  try {
    const base = trimTrailingSlashes(TRANSLATE_API_BASE || DEFAULT_TRANSLATE_API_BASE);
    const res = await fetch(`${base}/health`);
    const data = await res.json().catch(() => ({}));
    return res.ok && (data?.status === 'ok' || data?.status === true);
  } catch {
    return false;
  }
}

// --- Unsplash API (Find Images) ---
const UNSPLASH_BASE = 'https://api.unsplash.com';

export const isUnsplashConfigured =
  typeof process !== 'undefined' && !!process.env?.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY?.trim();

export interface UnsplashPhoto {
  id: string;
  urls: { raw?: string; full?: string; regular?: string; small?: string; thumb?: string };
  user: { name: string; username?: string; links?: { html?: string } };
  links: { html: string };
  alt_description?: string | null;
}

function getUnsplashHeaders(): Record<string, string> {
  const key = typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY : '';
  return { Authorization: `Client-ID ${key || ''}` };
}

export async function fetchUnsplashPhotos(perPage = 12, page = 1): Promise<UnsplashPhoto[]> {
  if (!isUnsplashConfigured) return [];
  try {
    const res = await fetch(
      `${UNSPLASH_BASE}/photos?page=${page}&per_page=${perPage}&order_by=latest`,
      { headers: getUnsplashHeaders() }
    );
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function searchUnsplashPhotos(
  query: string,
  perPage = 12,
  page = 1
): Promise<UnsplashPhoto[]> {
  if (!isUnsplashConfigured || !String(query).trim()) return [];
  try {
    const res = await fetch(
      `${UNSPLASH_BASE}/search/photos?query=${encodeURIComponent(query.trim())}&page=${page}&per_page=${perPage}`,
      { headers: getUnsplashHeaders() }
    );
    const json = await res.json().catch(() => ({}));
    const results = json?.results;
    return Array.isArray(results) ? results : [];
  } catch {
    return [];
  }
}
