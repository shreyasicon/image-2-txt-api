import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GlassCard } from '@/components/glass-card';

describe('GlassCard', () => {
  it('renders children', () => {
    render(<GlassCard>Hello</GlassCard>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
