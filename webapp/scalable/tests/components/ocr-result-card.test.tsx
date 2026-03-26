import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { OCRResultCard } from '@/components/ocr-result-card';

describe('OCRResultCard', () => {
  it('shows confidence and metrics branch', async () => {
    const user = userEvent.setup();
    render(
      <OCRResultCard
        text="hello"
        confidence={0.5}
        success
        uploadValidation={{ valid: true }}
        quality={{
          status: 'ok',
          score: 8,
          metrics: { charCount: 5, alphaRatio: 0.5, fileType: 'png' },
        }}
        script={{ primaryScript: 'Latn', likelyEnglish: true }}
      />
    );
    expect(screen.getByText(/50%/)).toBeInTheDocument();
    expect(screen.getByText(/English/)).toBeInTheDocument();
    expect(screen.getByText(/charCount: 5/)).toBeInTheDocument();
    await user.click(screen.getByTitle('Copy extracted text'));
  });
});
