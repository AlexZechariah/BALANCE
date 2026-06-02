'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { KeyRound, LogOut, MailCheck, MailWarning, ShieldCheck } from 'lucide-react';

import { useAuth } from '@/context/auth-context';
import { BalanceApiError } from '@/lib/api/client';
import {
  listSessions,
  requestEmailVerification,
  revokeOtherSessions,
  type AuthSessionSummary,
} from '@/lib/api/auth';
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
  const { user, updateAccount, logout } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sessions, setSessions] = useState<AuthSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionActionPending, setSessionActionPending] = useState(false);

  useEffect(() => {
    listSessions()
      .then(({ sessions: activeSessions }) => setSessions(activeSessions))
      .catch(() => setError('Active sessions could not be loaded.'))
      .finally(() => setSessionsLoading(false));
  }, []);

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

  async function resendVerification() {
    if (!user) return;
    setError(null);
    setNotice(null);
    try {
      await requestEmailVerification(user.email);
      setNotice('Verification requested. Check the configured delivery channel.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request email verification.');
    }
  }

  async function revokeOthers() {
    setError(null);
    setNotice(null);
    setSessionActionPending(true);
    try {
      const { revokedCount } = await revokeOtherSessions();
      const { sessions: activeSessions } = await listSessions();
      setSessions(activeSessions);
      setNotice(`${revokedCount} other active ${revokedCount === 1 ? 'session' : 'sessions'} revoked.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke other sessions.');
    } finally {
      setSessionActionPending(false);
    }
  }

  async function signOut() {
    setSessionActionPending(true);
    await logout();
    window.location.assign('/login');
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
            <CardTitle>Email verification</CardTitle>
            <p className="text-sm text-muted-foreground">
              Verified email is required for claims and privileged review, membership, and administration actions.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              {user?.emailVerifiedAt ? (
                <>
                  <MailCheck className="size-4 text-success" aria-hidden="true" />
                  <span>Verified on {new Date(user.emailVerifiedAt).toLocaleDateString()}</span>
                </>
              ) : (
                <>
                  <MailWarning className="size-4 text-warning" aria-hidden="true" />
                  <span>Verification required for high-trust actions.</span>
                </>
              )}
            </div>
            {!user?.emailVerifiedAt && (
              <Button type="button" variant="outline" onClick={() => void resendVerification()}>
                Resend verification
              </Button>
            )}
          </CardContent>
        </Card>

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

        <Card variant="panel" className="max-w-2xl">
          <CardHeader>
            <CardTitle>Active sessions</CardTitle>
            <p className="text-sm text-muted-foreground">
              Only session timing and current-session status are shown. Sign out to revoke this session.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            {sessionsLoading ? (
              <p className="text-sm text-muted-foreground" role="status">Loading active sessions...</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active sessions were returned.</p>
            ) : (
              <ul className="grid gap-3" aria-label="Active sessions">
                {sessions.map((session) => (
                  <li key={session.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium">
                        <KeyRound className="size-4" aria-hidden="true" />
                        {session.isCurrent ? 'Current session' : 'Other session'}
                      </span>
                      <span className="text-muted-foreground">
                        Expires {new Date(session.expiresAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      Created {new Date(session.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={sessionActionPending || sessions.every((session) => session.isCurrent)}
                onClick={() => void revokeOthers()}
              >
                Revoke other sessions
              </Button>
              <Button type="button" variant="destructive" disabled={sessionActionPending} onClick={() => void signOut()}>
                <LogOut className="size-4" />
                Sign out
              </Button>
            </div>
            {notice && <Alert role="status" variant="success">{notice}</Alert>}
            {error && <Alert role="alert" variant="destructive">{error}</Alert>}
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
