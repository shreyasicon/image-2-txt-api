import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createAuthMock } from '../helpers/mock-auth';
import UploadPage from '@/app/dashboard/upload/page';

vi.mock('@/components/auth-provider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    extractTextFromImage: vi.fn().mockResolvedValue({
      text: 'extracted',
      success: true,
      confidence: 0.9,
      jobId: 'j1',
    }),
    cacheOcrResult: vi.fn(),
  };
});

describe('UploadPage', () => {
  it('runs OCR after file select', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    const { extractTextFromImage } = await import('@/lib/api');
    vi.mocked(useAuth).mockReturnValue(createAuthMock());
    const user = userEvent.setup();
    render(<UploadPage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    await user.upload(input, file);
    await waitFor(() => {
      expect(extractTextFromImage).toHaveBeenCalled();
      expect(screen.getByText('extracted')).toBeInTheDocument();
    });
  });
});
