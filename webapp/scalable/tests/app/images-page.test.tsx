import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FindImagesPage from '@/app/dashboard/images/page';

const unsplashMocks = vi.hoisted(() => ({
  fetchUnsplashPhotos: vi.fn(),
  searchUnsplashPhotos: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    isUnsplashConfigured: true,
    fetchUnsplashPhotos: unsplashMocks.fetchUnsplashPhotos,
    searchUnsplashPhotos: unsplashMocks.searchUnsplashPhotos,
  };
});

describe('FindImagesPage', () => {
  beforeEach(() => {
    unsplashMocks.fetchUnsplashPhotos.mockResolvedValue([]);
    unsplashMocks.searchUnsplashPhotos.mockResolvedValue([]);
  });

  it('renders heading when Unsplash is mocked on', async () => {
    render(<FindImagesPage />);
    await waitFor(() => {
      expect(screen.getByText('Find Images')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Unsplash key not set/i)).not.toBeInTheDocument();
  });

  it('renders photo grid when API returns photos', async () => {
    unsplashMocks.fetchUnsplashPhotos.mockResolvedValue([
      {
        id: '1',
        urls: { small: 'https://example.com/p.jpg', regular: 'https://example.com/p.jpg' },
        user: { name: 'Photographer' },
        links: { html: 'https://unsplash.com/photos/1' },
      },
    ]);
    render(<FindImagesPage />);
    await waitFor(() => {
      expect(screen.getByAltText('Unsplash photo')).toBeInTheDocument();
    });
    expect(screen.getByText(/Photographer/)).toBeInTheDocument();
  });
});
