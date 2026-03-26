import { afterEach, describe, expect, it, vi } from 'vitest';

describe('amplify config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reports not configured when pool ids missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_COGNITO_USER_POOL_ID', '');
    vi.stubEnv('NEXT_PUBLIC_COGNITO_CLIENT_ID', '');
    const mod = await import('@/lib/amplify');
    expect(mod.isCognitoConfigured).toBe(false);
    expect(mod.userPoolId).toBe('');
    expect(mod.getAmplifyConfig().Auth.Cognito.userPoolClientId).toBe('');
  });

  it('reports configured when both ids set', async () => {
    vi.stubEnv('NEXT_PUBLIC_COGNITO_USER_POOL_ID', 'pool_1');
    vi.stubEnv('NEXT_PUBLIC_COGNITO_CLIENT_ID', 'client_1');
    vi.stubEnv('NEXT_PUBLIC_AWS_REGION', 'eu-west-1');
    const mod = await import('@/lib/amplify');
    expect(mod.isCognitoConfigured).toBe(true);
    expect(mod.region).toBe('eu-west-1');
    expect(mod.getAmplifyConfig().Auth.Cognito).toEqual({
      userPoolId: 'pool_1',
      userPoolClientId: 'client_1',
    });
  });
});
