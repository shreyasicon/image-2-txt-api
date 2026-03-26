import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cacheOcrResult,
  extractTextFromImage,
  extractTextFromImageAsync,
  fetchUnsplashPhotos,
  formatConfidence,
  getOcrJob,
  getTranslateLanguages,
  listMyOcrJobs,
  listMyS3Links,
  pollOcrJobUntilDone,
  searchUnsplashPhotos,
  translateHealth,
  translateText,
} from '@/lib/api';

describe('formatConfidence', () => {
  it('normalizes 0–1 and 0–100 ranges', () => {
    expect(formatConfidence(0.85)).toBe(85);
    expect(formatConfidence(85)).toBe(85);
    expect(formatConfidence(150)).toBe(100);
    expect(formatConfidence(-10)).toBe(0);
  });
});

describe('getOcrJob and cache', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns cached completed job without fetch', async () => {
    cacheOcrResult('j1', {
      text: 'cached',
      confidence: 0.9,
      success: true,
      jobId: 'j1',
      filename: 'a.png',
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('should not fetch'));
    const job = await getOcrJob('j1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(job?.text).toBe('cached');
    expect(job?.status).toBe('completed');
  });

  it('fetches when no cache and completes cache on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        jobId: 'j2',
        filename: 'b.png',
        text: 'hello',
        confidence: 0.5,
        status: 'completed',
        s3Key: 'k1',
      }),
    } as Response);
    const job = await getOcrJob('j2');
    expect(job?.text).toBe('hello');
    const again = await getOcrJob('j2');
    expect(again?.text).toBe('hello');
  });

  it('returns null when response not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);
    expect(await getOcrJob('missing')).toBeNull();
  });
});

describe('pollOcrJobUntilDone', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns result when job completes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'processing', jobId: 'p1', text: '', confidence: 0 }),
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'completed',
          jobId: 'p1',
          text: 'done',
          confidence: 1,
          filename: 'f.png',
        }),
      } as Response);

    const result = await pollOcrJobUntilDone('p1', undefined, { intervalMs: 5, maxWaitMs: 10_000 });
    expect(result?.success).toBe(true);
    expect(result?.text).toBe('done');
  });

  it('returns failure object when job failed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'failed', jobId: 'f1', text: 'err' }),
    } as Response);
    const result = await pollOcrJobUntilDone('f1', undefined, { intervalMs: 5, maxWaitMs: 10_000 });
    expect(result?.success).toBe(false);
    expect(result?.error).toBe('Job failed');
  });
});

function pngFile(size = 100) {
  return new File([new Uint8Array(size)], 't.png', { type: 'image/png' });
}

describe('extractTextFromImage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects oversized files', async () => {
    const huge = pngFile(7 * 1024 * 1024);
    const r = await extractTextFromImage(huge);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/too large/i);
  });

  it('returns text on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'OCR', confidence: 0.95 }),
    } as Response);
    const r = await extractTextFromImage(pngFile());
    expect(r.success).toBe(true);
    expect(r.text).toBe('OCR');
  });

  it('maps network-style errors to friendly message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Failed to fetch'));
    const r = await extractTextFromImage(pngFile());
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Cannot reach the OCR API/i);
  });
});

describe('extractTextFromImageAsync', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns job handle on 202', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 202,
      ok: false,
      json: async () => ({ jobId: 'async-1', status: 'processing' }),
    } as Response);
    const r = await extractTextFromImageAsync(pngFile());
    expect('success' in r && r.success === true).toBe(true);
    if ('jobId' in r) expect(r.jobId).toBe('async-1');
  });
});

describe('listMyOcrJobs / listMyS3Links', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('listMyOcrJobs returns null without token', async () => {
    expect(await listMyOcrJobs(async () => null)).toBeNull();
  });

  it('listMyOcrJobs parses jobs on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [{ jobId: '1', filename: 'a', text: 't', confidence: 1, createdAt: 'x' }] }),
    } as Response);
    const res = await listMyOcrJobs(async () => 'tok');
    expect(res?.jobs).toHaveLength(1);
  });

  it('listMyS3Links returns null on error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    expect(await listMyS3Links(async () => 'tok')).toBeNull();
  });
});

describe('translate API', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('translateText returns payload on ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        original_text: 'hi',
        source_lang: 'en',
        translations: { es: 'hola' },
      }),
    } as Response);
    const r = await translateText(' hi ', { source_lang: 'en', target_languages: ['es'] });
    expect(r?.translations.es).toBe('hola');
  });

  it('getTranslateLanguages returns data when ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ source: 'en', target: ['es'] }),
    } as Response);
    const r = await getTranslateLanguages();
    expect(r?.source).toBe('en');
  });

  it('translateHealth reflects status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    } as Response);
    expect(await translateHealth()).toBe(true);
  });
});

describe('Unsplash helpers', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('fetchUnsplashPhotos returns [] when not configured', async () => {
    const photos = await fetchUnsplashPhotos();
    expect(photos).toEqual([]);
  });

  it('searchUnsplashPhotos returns [] for blank query', async () => {
    expect(await searchUnsplashPhotos('  ')).toEqual([]);
  });
});
