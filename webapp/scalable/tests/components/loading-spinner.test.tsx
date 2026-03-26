import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingSpinner } from '@/components/loading-spinner';

describe('LoadingSpinner', () => {
  it('renders', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });
});
