import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createAuthMock } from '../helpers/mock-auth';
import SettingsPage from '@/app/dashboard/settings/page';

const { routerStub } = vi.hoisted(() => ({
  routerStub: { replace: vi.fn(), push: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerStub,
}));

vi.mock('@/components/auth-provider', () => ({
  useAuth: vi.fn(),
}));

describe('SettingsPage', () => {
  it('redirects copy when not signed in', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    vi.mocked(useAuth).mockReturnValue(createAuthMock({ user: null }));
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Redirecting/i)).toBeInTheDocument();
    });
  });

  it('shows settings for signed-in user', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    vi.mocked(useAuth).mockReturnValue(createAuthMock());
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });
});
