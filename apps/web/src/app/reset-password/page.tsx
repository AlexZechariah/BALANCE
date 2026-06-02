'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { validatePasswordPolicy } from '@balance/types';

import { BalanceIcon } from '@/components/brand/BalanceIcon';
import { PasswordField } from '@/components/forms/password-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/theme-toggle';
import { confirmPasswordReset } from '@/lib/api/auth';
import { BalanceApiError } from '@/lib/api/client';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError('Reset token is required.');
      return;
    }
    const passwordError = validatePasswordPolicy(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(token.trim(), password);
      setCompleted(true);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err instanceof BalanceApiError && err.status === 401) {
        setError('Reset token is invalid or expired.');
      } else if (err instanceof BalanceApiError && err.status >= 500) {
        setError('Service unavailable. Please try again.');
      } else {
        setError('Password reset failed. Please try again.');
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
            <span className="font-display text-lg font-semibold">Balance</span>
          </div>
          <CardTitle className="text-2xl">Set New Password</CardTitle>
          <p className="text-sm text-muted-foreground">Use your reset token to choose a new password.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div>
              <Label htmlFor="token">Reset token</Label>
              <Input
                id="token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                disabled={submitting}
                placeholder="Paste reset token"
              />
            </div>

            <PasswordField
              id="password"
              label="New password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              disabled={submitting}
              placeholder="At least 15 characters"
            />

            <PasswordField
              id="confirmPassword"
              label="Confirm password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              disabled={submitting}
              placeholder="Re-enter password"
            />

            {completed && <Alert role="status" variant="success">Password reset completed.</Alert>}
            {error && <Alert role="alert" variant="destructive">{error}</Alert>}

            <Button type="submit" disabled={submitting || completed} className="w-full">
              {submitting ? 'Saving...' : 'Save password'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Ready to continue?{' '}
            <Link href="/login" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
