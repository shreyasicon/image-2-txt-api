import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '@/components/theme-provider';

describe('ThemeProvider', () => {
  it('renders children', () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <span>child</span>
      </ThemeProvider>
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
