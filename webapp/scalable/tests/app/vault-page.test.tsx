import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createAuthMock } from '../helpers/mock-auth';
import VaultPage from '@/app/dashboard/vault/page';

const { routerStub } = vi.hoisted(() => ({
  routerStub: { replace: vi.fn(), push: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerStub,
}));

vi.mock('@/components/auth-provider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    listMyS3Links: vi.fn().mockResolvedValue({ userId: 'u1', items: [] }),
  };
});

describe('VaultPage', () => {
  it('loads vault for signed-in user', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    vi.mocked(useAuth).mockReturnValue(createAuthMock());
    localStorage.setItem('vaultItems', JSON.stringify([]));
    render(<VaultPage />);
    await waitFor(() => {
      expect(
        screen.getAllByRole('heading', { level: 1, name: /your vault/i }).length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('filters text items by search query', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    vi.mocked(useAuth).mockReturnValue(createAuthMock());
    localStorage.setItem(
      'vaultItems',
      JSON.stringify([
        { id: '1', type: 'text', title: 'Alpha note', content: 'aaa', date: '2024-01-01' },
        { id: '2', type: 'text', title: 'Beta note', content: 'bbb', date: '2024-01-02' },
      ])
    );
    const user = userEvent.setup();
    render(<VaultPage />);
    await waitFor(() => {
      expect(
        screen.getAllByRole('heading', { level: 1, name: /your vault/i }).length
      ).toBeGreaterThanOrEqual(1);
    });
    const [searchInput] = screen.getAllByPlaceholderText('Search by title or content...');
    await user.type(searchInput, 'Beta');
    await waitFor(() => {
      expect(screen.getByText(/Showing 1 of 2 items/)).toBeInTheDocument();
    });
  });

  it('renders edit title buttons for saved image items', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    vi.mocked(useAuth).mockReturnValue(createAuthMock());
    localStorage.setItem(
      'vaultItems',
      JSON.stringify([
        {
          id: 'img-1',
          type: 'image',
          title: 'Old title',
          content: 'data:image/png;base64,AAA=',
          date: '2024-01-01',
        },
      ])
    );

    render(<VaultPage />);
    await waitFor(() => {
      expect(screen.getAllByLabelText(/edit title/i).length).toBeGreaterThanOrEqual(1);
    });
  });
});
