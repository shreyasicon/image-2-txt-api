import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from '@/components/logo';

describe('Logo', () => {
  it('shows brand text', () => {
    render(<Logo />);
    expect(screen.getByText('ICONIC VAULT')).toBeInTheDocument();
  });
});
