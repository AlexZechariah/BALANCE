'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { BalanceApiError } from '../../lib/api/client';
import { homeForRole } from '../../lib/auth-routing';
import { BalanceIcon } from '@/components/brand/BalanceIcon';
import { PasswordField } from '@/components/forms/password-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/theme-toggle';

export default function LoginPage() {
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Redirect already-authenticated users.
  // Must happen in an effect (not during render) to avoid React's
  // "Cannot update a component (Router) while rendering a different component" warning.
  useEffect(() => {
    if (authLoading || !user) return;
    router.replace(homeForRole(user.role));
  }, [authLoading, router, user]);

  if (!authLoading && user) {
    // Render nothing while the redirect effect runs.
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) { setError('Email is required.'); return; }
    if (!password) { setError('Password is required.'); return; }

    setSubmitting(true);
    try {
      const loggedInUser = await login(email.trim(), password);
      router.replace(homeForRole(loggedInUser.role));
    } catch (err) {
      if (err instanceof BalanceApiError && err.status === 401) {
        setError('Invalid email or password.');
      } else if (err instanceof BalanceApiError && err.status >= 500) {
        setError('Service unavailable. Please try again.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-8 text-foreground">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card variant="panel" className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <BalanceIcon className="size-6" aria-hidden="true" />
            <span className="text-lg font-semibold font-display">Balance</span>
          </div>
          <CardTitle className="text-2xl">Sign In</CardTitle>
          <p className="text-sm text-muted-foreground">Access documents, claims, reviews, and audit history.</p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                placeholder="you@balance.local"
              />
            </div>

            <PasswordField
              id="password"
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              disabled={submitting}
              placeholder="Password"
            />

            <div className="text-right text-sm">
              <Link href="/forgot-password" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
                Forgot password?
              </Link>
            </div>

            {error && (
              <Alert role="alert" variant="destructive">{error}</Alert>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
