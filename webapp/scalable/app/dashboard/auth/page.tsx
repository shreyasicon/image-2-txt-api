'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle } from 'lucide-react';

export default function AuthPage() {
  const auth = useAuth();
  const router = useRouter();
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpName, setSignUpName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signUpSent, setSignUpSent] = useState(false);

  /** Full-viewport-height column so only this page centers vertically; other dashboard pages unchanged. */
  const centerShell = (inner: React.ReactNode) => (
    <div className="flex min-h-[100dvh] w-full items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">{inner}</div>
    </div>
  );

  if (auth?.loading) {
    return centerShell(<p className="text-center text-muted-foreground">Loading...</p>);
  }

  if (!auth?.isConfigured) {
    return centerShell(
      <Card>
        <CardHeader>
          <CardTitle>Sign in not configured</CardTitle>
          <CardDescription>
            Add NEXT_PUBLIC_COGNITO_USER_POOL_ID and NEXT_PUBLIC_COGNITO_CLIENT_ID to .env.local. Run API deploy.js to create the Cognito User Pool.
          </CardDescription>
        </CardHeader>
      </Card>,
    );
  }

  if (auth?.user) {
    router.replace('/dashboard');
    return centerShell(<p className="text-center text-muted-foreground">Signed in. Redirecting...</p>);
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await auth!.signIn(signInEmail.trim(), signInPassword);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await auth!.signUp(signUpEmail.trim(), signUpPassword, signUpName.trim() || undefined);
      setSignUpSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  return centerShell(
    <Card>
      <CardHeader>
        <CardTitle>Sign in to Iconic Vault</CardTitle>
        <CardDescription>Your uploads and data are linked to your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input id="signin-email" type="email" placeholder="you@example.com" value={signInEmail} onChange={(e) => setSignInEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <Input id="signin-password" type="password" value={signInPassword} onChange={(e) => setSignInPassword(e.target.value)} required />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</Button>
            </form>
          </TabsContent>
          <TabsContent value="signup">
            {signUpSent ? (
              <p className="text-sm text-muted-foreground">Check your email to confirm your account, then sign in above.</p>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input id="signup-email" type="email" placeholder="you@example.com" value={signUpEmail} onChange={(e) => setSignUpEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password (min 8)</Label>
                  <Input id="signup-password" type="password" value={signUpPassword} onChange={(e) => setSignUpPassword(e.target.value)} minLength={8} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Name (optional)</Label>
                  <Input id="signup-name" type="text" placeholder="Your name" value={signUpName} onChange={(e) => setSignUpName(e.target.value)} />
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Creating account...' : 'Create account'}</Button>
              </form>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>,
  );
}
