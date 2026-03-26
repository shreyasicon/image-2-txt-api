import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createAuthMock } from '../helpers/mock-auth';
import DashboardPage from '@/app/dashboard/page';

vi.mock('@/components/auth-provider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    listMyOcrJobs: vi.fn().mockResolvedValue({ jobs: [] }),
    listMyS3Links: vi.fn().mockResolvedValue({ userId: 'u1', items: [] }),
  };
});

describe('DashboardPage', () => {
  it('shows login hint when guest', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    vi.mocked(useAuth).mockReturnValue(createAuthMock({ user: null }));
    render(<DashboardPage />);
    expect(screen.getByText(/Login to enjoy all features/i)).toBeInTheDocument();
  });

  it('shows stats when signed in', async () => {
    const { useAuth } = await import('@/components/auth-provider');
    vi.mocked(useAuth).mockReturnValue(createAuthMock());
    render(<DashboardPage />);
    expect(screen.getAllByText(/Welcome to Your/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Images extracted')).toBeInTheDocument();
  });
});
