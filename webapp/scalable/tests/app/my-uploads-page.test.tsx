import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MyUploadsRedirectPage from '@/app/dashboard/my-uploads/page';

const { routerStub } = vi.hoisted(() => ({
  routerStub: { replace: vi.fn(), push: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerStub,
}));

describe('MyUploadsRedirectPage', () => {
  it('shows redirect message', () => {
    render(<MyUploadsRedirectPage />);
    expect(screen.getByText(/Redirecting to Vault/i)).toBeInTheDocument();
  });
});
