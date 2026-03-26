import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('merges class names and resolves tailwind conflicts', () => {
    expect(cn('px-2 py-1', 'px-4')).toContain('px-4');
    expect(cn('foo', false && 'bar', 'baz')).toContain('foo');
    expect(cn('foo', 'baz')).toContain('baz');
  });
});
