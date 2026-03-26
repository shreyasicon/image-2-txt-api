import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createAuthMock } from '../helpers/mock-auth';
import { Sidebar } from '@/components/sidebar';

const { routerStub } = vi.hoisted(() => ({
  routerStub: { replace: vi.fn(), push: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => routerStub,
}));

vi.mock('@/components/auth-provider', () => ({
  useAuth: vi.fn(),
}));

describe('Sidebar', () => {
  it('shows log in when guest', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    vi.mocked(useAuth).mockReturnValue(
      createAuthMock({ user: null, loading: false })
    );
    render(<Sidebar />);
    expect(screen.getByText('Log in')).toBeInTheDocument();
  });

  it('shows log out when signed in', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    vi.mocked(useAuth).mockReturnValue(createAuthMock());
    render(<Sidebar />);
    expect(screen.getByText('Vault')).toBeInTheDocument();
    expect(screen.getByText('Log out')).toBeInTheDocument();
  });
});
