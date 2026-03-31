import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TranslatePage from '@/app/dashboard/translate/page';

const translateApi = vi.hoisted(() => ({
  translateHealth: vi.fn().mockResolvedValue(true),
  translateText: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    translateHealth: translateApi.translateHealth,
    translateText: translateApi.translateText,
  };
});

describe('TranslatePage', () => {
  afterEach(() => {
    vi.useRealTimers();
    translateApi.translateText.mockResolvedValue(null);
  });

  it('renders and health check clears apiDown', async () => {
    vi.useFakeTimers();
    render(<TranslatePage />);
    expect(screen.getByText(/Multi-language translation/i)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByText(/Translation API is unreachable/i)).not.toBeInTheDocument();
  });

  it('shows translation results after submit', async () => {
    translateApi.translateText.mockResolvedValue({
      original_text: 'Hello',
      source_lang: 'en',
      translations: { es: 'Hola' },
    });
    const user = userEvent.setup();
    vi.useFakeTimers();
    render(<TranslatePage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    vi.useRealTimers();
    const [textArea] = screen.getAllByPlaceholderText('Hello world');
    await user.type(textArea, 'Hello');
    const translateBtns = screen.getAllByRole('button', { name: 'Translate' });
    const enabled = translateBtns.filter((b) => !b.hasAttribute('disabled'));
    expect(enabled.length).toBeGreaterThanOrEqual(1);
    await user.click(enabled[0]!);
    await waitFor(() => {
      expect(screen.getAllByText('Hola').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Results/i).length).toBeGreaterThanOrEqual(1);
    });
  });
});
