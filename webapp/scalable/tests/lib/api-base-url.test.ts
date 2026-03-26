import { afterEach, describe, expect, it, vi } from 'vitest';

describe('OCR API base URL from env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('trims trailing slashes from NEXT_PUBLIC_OCR_API_BASE', async () => {
    vi.stubEnv('NEXT_PUBLIC_OCR_API_BASE', 'https://api.example.com///');
    const { getOcrApiBaseUrl, getOcrApiOcrUrl } = await import('@/lib/api');
    expect(getOcrApiBaseUrl()).toBe('https://api.example.com');
    expect(getOcrApiOcrUrl()).toBe('https://api.example.com/ocr');
  });
});
