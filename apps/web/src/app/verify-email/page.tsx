'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { BalanceIcon } from '@/components/brand/BalanceIcon';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/theme-toggle';
import { confirmEmailVerification } from '@/lib/api/auth';
import { BalanceApiError } from '@/lib/api/client';

export default function VerifyEmailPage() {
  const [token, setToken] = useState('');
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
      setError('Verification token is required.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmEmailVerification(token.trim());
      setCompleted(true);
    } catch (err) {
      if (err instanceof BalanceApiError && err.status === 401) {
        setError('Verification token is invalid or expired.');
      } else if (err instanceof BalanceApiError && err.status >= 500) {
        setError('Service unavailable. Please try again.');
      } else {
        setError('Email verification failed. Please try again.');
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
          <CardTitle className="text-2xl">Verify Email</CardTitle>
          <p className="text-sm text-muted-foreground">Confirm ownership of your email address.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div>
              <Label htmlFor="token">Verification token</Label>
              <Input
                id="token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                disabled={submitting}
                placeholder="Paste verification token"
              />
            </div>

            {completed && <Alert role="status" variant="success">Email verification completed.</Alert>}
            {error && <Alert role="alert" variant="destructive">{error}</Alert>}

            <Button type="submit" disabled={submitting || completed} className="w-full">
              {submitting ? 'Verifying...' : 'Verify email'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Need a new token?{' '}
            <Link href="/resend-verification" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
              Resend verification
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
