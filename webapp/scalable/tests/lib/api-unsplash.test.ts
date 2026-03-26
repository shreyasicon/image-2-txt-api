import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Unsplash API with access key', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('fetchUnsplashPhotos returns photos from API', async () => {
    vi.stubEnv('NEXT_PUBLIC_UNSPLASH_ACCESS_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'p1',
          urls: { small: 'https://x/s.jpg' },
          user: { name: 'U' },
          links: { html: 'https://unsplash.com/x' },
        },
      ],
    } as Response);
    const { fetchUnsplashPhotos } = await import('@/lib/api');
    const photos = await fetchUnsplashPhotos(5, 1);
    expect(photos).toHaveLength(1);
    expect(photos[0].id).toBe('p1');
  });

  it('searchUnsplashPhotos returns results array', async () => {
    vi.stubEnv('NEXT_PUBLIC_UNSPLASH_ACCESS_KEY', 'k');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: 's1', urls: {}, user: { name: 'A' }, links: { html: 'h' } }] }),
    } as Response);
    const { searchUnsplashPhotos } = await import('@/lib/api');
    const photos = await searchUnsplashPhotos('cats');
    expect(photos).toHaveLength(1);
  });

  it('returns empty array on fetch error', async () => {
    vi.stubEnv('NEXT_PUBLIC_UNSPLASH_ACCESS_KEY', 'k');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const { fetchUnsplashPhotos } = await import('@/lib/api');
    expect(await fetchUnsplashPhotos()).toEqual([]);
  });
});
