// OCR API (Image to Text) – Lambda base URL for POST /ocr/base64, GET/PUT/DELETE /ocr/:jobId
const DEFAULT_OCR_API_BASE = 'https://xkdvpogqt0.execute-api.us-east-1.amazonaws.com/prod';
const OCR_API_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_OCR_API_BASE) || DEFAULT_OCR_API_BASE;

/** Base URL used for OCR requests (for display in UI). */
export function getOcrApiBaseUrl(): string {
  return (OCR_API_BASE || DEFAULT_OCR_API_BASE).replace(/\/+$/, '');
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

export async function extractTextFromImage(imageFile: File): Promise<OCRExtractResult> {
  try {
    if (imageFile.size > MAX_OCR_IMAGE_SIZE) {
      return {
        text: '',
        confidence: 0,
        success: false,
        error: `Image too large (max ${MAX_OCR_IMAGE_SIZE / 1024 / 1024}MB). Use a smaller file.`,
      };
    }
    const base = (OCR_API_BASE || DEFAULT_OCR_API_BASE).replace(/\/+$/, '');
    const dataUrl = await readFileAsDataUrl(imageFile);

    const response = await fetch(`${base}/ocr/base64`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const base = (TRANSLATE_API_BASE || DEFAULT_TRANSLATE_API_BASE).replace(/\/+$/, '');
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
    const base = (TRANSLATE_API_BASE || DEFAULT_TRANSLATE_API_BASE).replace(/\/+$/, '');
    const res = await fetch(`${base}/languages`);
    const data = await res.json().catch(() => ({}));
    return res.ok ? data : null;
  } catch {
    return null;
  }
}

export async function translateHealth(): Promise<boolean> {
  try {
    const base = (TRANSLATE_API_BASE || DEFAULT_TRANSLATE_API_BASE).replace(/\/+$/, '');
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

// OpenAI API Integration
export async function generateCaptions(
  text: string,
  tone: 'professional' | 'creative' | 'viral' = 'creative'
): Promise<string[]> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const toneDescriptions: Record<string, string> = {
      professional: 'formal, business-appropriate',
      creative: 'engaging, unique, thought-provoking',
      viral: 'attention-grabbing, shareable, trending',
    };

    const prompt = `Generate 5 high-quality social media captions based on this extracted content: "${text}". 
    Tone: ${toneDescriptions[tone]}.
    Format: Return ONLY the captions, one per line, without numbering or additional text.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse captions from response
    const captions = content
      .split('\n')
      .filter((line: string) => line.trim().length > 0)
      .slice(0, 5);

    return captions;
  } catch (error) {
    console.error('Caption generation error:', error);
    return [];
  }
}

export async function generateTags(text: string): Promise<string[]> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompt = `Generate 15 relevant hashtags for this content: "${text}". 
    Mix SEO-friendly and trending tags.
    Format: Return ONLY hashtags separated by spaces, without explanation.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse tags - extract hashtags
    const tags = content
      .match(/#\w+/g) || []
      .slice(0, 15);

    return tags;
  } catch (error) {
    console.error('Tag generation error:', error);
    return [];
  }
}

export async function enhanceContent(
  text: string,
  action: 'rewrite-formal' | 'rewrite-viral' | 'summarize' | 'expand' | 'translate'
): Promise<string> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const prompts: Record<string, string> = {
      'rewrite-formal': `Rewrite this content in a formal, professional tone: "${text}"`,
      'rewrite-viral': `Rewrite this content to be more viral, engaging, and shareable: "${text}"`,
      'summarize': `Summarize this content in 2-3 sentences: "${text}"`,
      'expand': `Expand this content with more details and context: "${text}"`,
      'translate': `Translate this content to professional Spanish: "${text}"`,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompts[action],
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Content enhancement error:', error);
    return '';
  }
}
