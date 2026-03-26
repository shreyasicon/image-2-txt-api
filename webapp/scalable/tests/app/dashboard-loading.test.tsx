import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DashboardLoading from '@/app/dashboard/loading';

describe('DashboardLoading', () => {
  it('shows loading state', () => {
    render(<DashboardLoading />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});
