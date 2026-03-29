'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Amplify } from 'aws-amplify';
import { getCurrentUser, fetchAuthSession, fetchUserAttributes, signIn as amplifySignIn, signOut as amplifySignOut, signUp as amplifySignUp, updateUserAttribute } from 'aws-amplify/auth';
import { getAmplifyConfig, isCognitoConfigured } from '@/lib/amplify';

export interface AuthUser {
  userId: string;
  username: string;
  email?: string;
  /** Display name (Cognito 'name' attribute), editable in Settings */
  name?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isConfigured: boolean;
  getIdToken: () => Promise<string | null>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  updateUsername: (username: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const AUTH_CHECK_TIMEOUT_MS = 6000;

  const refreshUser = useCallback(async () => {
    if (!isCognitoConfigured) {
      setUser(null);
      setLoading(false);
      return;
    }
    let done = false;
    const timeoutId = setTimeout(() => {
      if (done) return;
      done = true;
      setUser(null);
      setLoading(false);
    }, AUTH_CHECK_TIMEOUT_MS);
    try {
      const currentUser = await getCurrentUser();
      if (done) return;
      let name: string | undefined;
      try {
        const attrs = await fetchUserAttributes();
        name = (attrs?.name as string) || undefined;
      } catch (error) {
        console.error('Failed to fetch Cognito user attributes:', error);
      }
      setUser({
        userId: currentUser.userId,
        username: currentUser.username,
        name,
      });
    } catch (error) {
      console.error('Failed to resolve current user:', error);
      if (!done) setUser(null);
    } finally {
      done = true;
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  const updateUsername = useCallback(async (displayName: string) => {
    if (!isCognitoConfigured || !displayName.trim()) return;
    await updateUserAttribute({
      userAttribute: { attributeKey: 'name', value: displayName.trim() },
    });
    await refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (!isCognitoConfigured) {
      setLoading(false);
      return;
    }
    Amplify.configure(getAmplifyConfig());
    refreshUser();
  }, [refreshUser]);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!isCognitoConfigured) return null;
    try {
      const session = await fetchAuthSession({ tokens: true });
      const token = session.tokens?.idToken?.toString();
      return token || null;
    } catch (error) {
      console.error('Failed to fetch auth session for ID token:', error);
      return null;
    }
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    await amplifySignIn({ username, password });
    await refreshUser();
  }, [refreshUser]);

  const signOut = useCallback(async () => {
    await amplifySignOut();
    setUser(null);
  }, []);

  const signUpUser = useCallback(async (email: string, password: string, name?: string) => {
    await amplifySignUp({
      username: email,
      password,
      options: {
        userAttributes: {
          email,
          ...(name ? { name } : {}),
        },
      },
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isConfigured: isCognitoConfigured,
      getIdToken,
      signIn,
      signOut,
      signUp: signUpUser,
      updateUsername,
      refreshUser,
    }),
    [user, loading, getIdToken, signIn, signOut, signUpUser, updateUsername, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
