'use client';

import { useState } from 'react';
import { MailWarning } from 'lucide-react';

import { useAuth } from '@/context/auth-context';
import { requestEmailVerification } from '@/lib/api/auth';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function EmailVerificationNotice() {
  const { user } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (!user || user.emailVerifiedAt) return null;
  const email = user.email;

  async function resend() {
    setSending(true);
    try {
      await requestEmailVerification(email);
      setMessage('Verification requested. Check the configured delivery channel.');
    } catch {
      setMessage('Verification could not be requested. Try again later.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Alert role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <span className="flex min-w-0 items-start gap-2">
        <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Verify your email before submitting claims or using privileged review, membership, and administration actions.
          {message && <span className="mt-1 block text-sm">{message}</span>}
        </span>
      </span>
      <Button type="button" variant="outline" size="sm" disabled={sending} onClick={() => void resend()}>
        {sending ? 'Requesting...' : 'Resend verification'}
      </Button>
    </Alert>
  );
}
