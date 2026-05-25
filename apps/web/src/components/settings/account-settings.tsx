'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { useAuth } from '@/context/auth-context';
import { BalanceApiError } from '@/lib/api/client';
import { validatePasswordComplexity } from '@/lib/role-permissions';
import { Alert } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  alertDialogActionClassName,
  alertDialogCancelClassName,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordField } from '@/components/forms/password-field';

export function AccountSettings({ variant }: { variant: 'consumer' | 'enterprise' }) {
  const { user, updateAccount } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const sensitiveChange = useMemo(
    () => Boolean(user && (email.trim() !== user.email || newPassword)),
    [email, newPassword, user]
  );

  function validate(): string | null {
    if (!displayName.trim()) return 'Display name is required.';
    if (!email.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email address.';
    if (newPassword) {
      const passwordError = validatePasswordComplexity(newPassword);
      if (passwordError) return passwordError;
      if (newPassword !== confirmPassword) return 'New passwords do not match.';
    }
    if (sensitiveChange && !currentPassword) return 'Current password is required for email or password changes.';
    return null;
  }

  async function submit() {
    setError(null);
    setNotice(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await updateAccount({
        displayName: displayName.trim(),
        email: email.trim(),
        currentPassword: sensitiveChange ? currentPassword : undefined,
        newPassword: newPassword || undefined,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Account settings updated.');
      setConfirmOpen(false);
    } catch (err) {
      if (err instanceof BalanceApiError && err.status === 409) {
        setError('An account with this email already exists.');
      } else if (err instanceof BalanceApiError && err.status === 401) {
        setError('Current password is incorrect.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to update account settings.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sensitiveChange) {
      const validationError = validate();
      if (validationError) {
        setError(validationError);
        return;
      }
      setConfirmOpen(true);
      return;
    }
    void submit();
  }

  return (
    <>
      <div className="grid gap-5">
        <div>
          <p className="text-sm text-muted-foreground">{variant === 'enterprise' ? 'Account administration' : 'Personal account'}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Settings</h1>
        </div>

        <Card variant="panel" className="max-w-2xl">
          <CardHeader>
            <CardTitle>Profile and Security</CardTitle>
            <p className="text-sm text-muted-foreground">Keep your account identity and sign-in details current.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div>
                <Label htmlFor="displayName">Display name</Label>
                <Input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={submitting} />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} />
              </div>
              {sensitiveChange && (
                <PasswordField
                  id="currentPassword"
                  label="Current password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  disabled={submitting}
                  placeholder="Required for email or password changes"
                />
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <PasswordField
                  id="newPassword"
                  label="New password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={setNewPassword}
                  disabled={submitting}
                  placeholder="Leave blank to keep current password"
                />
                <PasswordField
                  id="confirmNewPassword"
                  label="Confirm new password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  disabled={submitting}
                  placeholder="Repeat new password"
                />
              </div>
              {notice && <Alert variant="success">{notice}</Alert>}
              {error && <Alert role="alert" variant="destructive">{error}</Alert>}
              <Button type="submit" className="w-fit" disabled={submitting}>
                <ShieldCheck className="size-4" />
                {submitting ? 'Saving...' : 'Save settings'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm account change</AlertDialogTitle>
            <AlertDialogDescription>
              This updates sign-in details for your account. Confirm that the email and password information is correct.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={alertDialogCancelClassName}>Cancel</AlertDialogCancel>
            <AlertDialogAction className={alertDialogActionClassName} onClick={() => void submit()}>
              Confirm update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
