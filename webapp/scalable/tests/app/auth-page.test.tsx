import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createAuthMock } from '../helpers/mock-auth';
import AuthPage from '@/app/dashboard/auth/page';

const { routerStub } = vi.hoisted(() => ({
  routerStub: { replace: vi.fn(), push: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerStub,
}));

vi.mock('@/components/auth-provider', () => ({
  useAuth: vi.fn(),
}));

describe('AuthPage', () => {
  it('shows loading', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    vi.mocked(useAuth).mockReturnValue(createAuthMock({ loading: true, user: null }));
    render(<AuthPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows not configured', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    vi.mocked(useAuth).mockReturnValue(
      createAuthMock({ isConfigured: false, user: null, loading: false })
    );
    render(<AuthPage />);
    expect(screen.getByText(/Sign in not configured/i)).toBeInTheDocument();
  });

  it('shows sign-in form when ready', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    vi.mocked(useAuth).mockReturnValue(createAuthMock({ user: null }));
    render(<AuthPage />);
    await waitFor(() => {
      expect(screen.getByText(/Sign in to Iconic Vault/i)).toBeInTheDocument();
    });
  });

  it('shows redirecting when already signed in', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    vi.mocked(useAuth).mockReturnValue(createAuthMock());
    render(<AuthPage />);
    expect(screen.getByText(/Signed in. Redirecting/i)).toBeInTheDocument();
  });
});
