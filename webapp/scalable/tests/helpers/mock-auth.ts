import { vi } from 'vitest';

export type AuthMock = {
  user: { userId: string; username: string; email?: string; name?: string } | null;
  loading: boolean;
  isConfigured: boolean;
  getIdToken: () => Promise<string | null>;
  signIn: (u: string, p: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (e: string, p: string, n?: string) => Promise<void>;
  updateUsername: (n: string) => Promise<void>;
  refreshUser: () => Promise<void>;
};

export function createAuthMock(overrides: Partial<AuthMock> = {}): AuthMock {
  return {
    user: { userId: 'u1', username: 'tester', email: 't@t.com', name: 'Tester' },
    loading: false,
    isConfigured: true,
    getIdToken: vi.fn().mockResolvedValue('test-token'),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    signUp: vi.fn().mockResolvedValue(undefined),
    updateUsername: vi.fn().mockResolvedValue(undefined),
    refreshUser: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
