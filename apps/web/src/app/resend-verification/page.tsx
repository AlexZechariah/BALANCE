'use client';

import Link from 'next/link';
import { useState } from 'react';

import { BalanceIcon } from '@/components/brand/BalanceIcon';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/theme-toggle';
import { requestEmailVerification } from '@/lib/api/auth';
import { BalanceApiError } from '@/lib/api/client';

export default function ResendVerificationPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDevToken(null);

    if (!email.trim()) {
      setError('Email is required.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestEmailVerification(email.trim());
      setSent(true);
      setDevToken(result.devToken ?? null);
    } catch (err) {
      if (err instanceof BalanceApiError && err.status >= 500) {
        setError('Service unavailable. Please try again.');
      } else {
        setError('Verification request failed. Please try again.');
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
          <CardTitle className="text-2xl">Resend Verification</CardTitle>
          <p className="text-sm text-muted-foreground">Request a fresh email verification token.</p>
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
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting}
                placeholder="you@balance.local"
              />
            </div>

            {sent && (
              <Alert role="status">If an account exists for that email, a verification token is ready.</Alert>
            )}

            {devToken && (
              <Alert role="status" variant="warning">
                Local dev token: <span className="break-all font-mono">{devToken}</span>
              </Alert>
            )}

            {error && <Alert role="alert" variant="destructive">{error}</Alert>}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Sending...' : 'Request verification'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have a token?{' '}
            <Link href="/verify-email" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
              Verify email
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
