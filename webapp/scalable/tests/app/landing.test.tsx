import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LandingPage from '@/app/page';

describe('LandingPage', () => {
  it('renders hero and CTA', () => {
    render(<LandingPage />);
    expect(screen.getAllByText('ICONIC VAULT').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: /Launch App/i })).toHaveAttribute('href', '/dashboard');
  });
});
