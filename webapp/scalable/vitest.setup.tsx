import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';

globalThis.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock');
globalThis.URL.revokeObjectURL = vi.fn();

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock('next/link', () => ({
  default ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

vi.mock('next/image', () => ({
  default (props: Record<string, unknown> & { src?: string; alt?: string }) {
    const { src, alt, fill: _f, unoptimized: _u, priority: _p, ...rest } = props;
    return <img src={src as string} alt={(alt as string) || ''} {...rest} />;
  },
}));
