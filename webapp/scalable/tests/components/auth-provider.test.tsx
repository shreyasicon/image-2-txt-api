import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/components/auth-provider';

vi.mock('aws-amplify', () => ({
  Amplify: { configure: vi.fn() },
}));

vi.mock('aws-amplify/auth', () => ({
  getCurrentUser: vi.fn().mockRejectedValue(new Error('signed out')),
  fetchAuthSession: vi.fn(),
  fetchUserAttributes: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  updateUserAttribute: vi.fn(),
}));

vi.mock('@/lib/amplify', () => ({
  isCognitoConfigured: false,
  getAmplifyConfig: () => ({ Auth: { Cognito: { userPoolId: '', userPoolClientId: '' } } }),
}));

function Consumer() {
  const auth = useAuth();
  if (!auth) return <span>no-context</span>;
  if (auth.loading) return <span>loading</span>;
  return <span>ready-{auth.isConfigured ? 'on' : 'off'}</span>;
}

describe('AuthProvider', () => {
  it('provides context when Cognito is not configured', async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByText('ready-off')).toBeInTheDocument();
    });
  });
});
