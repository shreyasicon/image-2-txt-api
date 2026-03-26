import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GlowButton } from '@/components/glow-button';

describe('GlowButton', () => {
  it('fires click', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<GlowButton onClick={onClick}>Go</GlowButton>);
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalled();
  });
});
