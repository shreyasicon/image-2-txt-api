/**
 * AWS Amplify config for Cognito (client-side only).
 * Set NEXT_PUBLIC_COGNITO_USER_POOL_ID and NEXT_PUBLIC_COGNITO_CLIENT_ID in .env.local.
 */
const region = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_AWS_REGION) || 'us-east-1';
const userPoolId = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_COGNITO_USER_POOL_ID) || '';
const userPoolClientId = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_COGNITO_CLIENT_ID) || '';

export const isCognitoConfigured = Boolean(userPoolId && userPoolClientId);

export function getAmplifyConfig() {
  return {
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
      },
    },
  };
}

export { region, userPoolId, userPoolClientId };
