import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UploadCard } from '@/components/upload-card';

describe('UploadCard', () => {
  it('calls onFileSelect when selecting image', async () => {
    const onFileSelect = vi.fn();
    const user = userEvent.setup();
    render(<UploadCard onFileSelect={onFileSelect} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    await user.upload(input, file);
    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it('shows preview when file selected', () => {
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    render(<UploadCard onFileSelect={vi.fn()} selectedFile={file} onClear={vi.fn()} />);
    expect(screen.getByText('pic.png')).toBeInTheDocument();
  });
});
