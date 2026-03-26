import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VaultCard } from '@/components/vault-card';

describe('VaultCard', () => {
  it('toggles expand and shows tags', async () => {
    const user = userEvent.setup();
    render(
      <VaultCard
        id="1"
        type="text"
        title="T"
        content={'x'.repeat(120)}
        date="today"
        tags={['a']}
      />
    );
    await user.click(screen.getByTitle('Toggle details'));
    expect(screen.getByText('Tags:')).toBeInTheDocument();
    await user.click(screen.getByTitle('Copy content'));
  });

  it('calls onDelete', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <VaultCard id="2" type="caption" title="C" content="body" date="d" onDelete={onDelete} />
    );
    await user.click(screen.getByTitle('Delete'));
    expect(onDelete).toHaveBeenCalledWith('2');
  });
});
