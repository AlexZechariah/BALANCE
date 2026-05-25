'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Building2, User } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';

type AccountType = 'individual' | 'enterprise';

export default function RegisterPage() {
  const { register: authRegister, user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [accountType, setAccountType] = useState<AccountType>('individual');
  const [displayName, setDisplayName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Redirect already-authenticated users.
  useEffect(() => {
    if (authLoading || !user) return;
    router.replace(homeForRole(user.role));
  }, [authLoading, router, user]);

  if (!authLoading && user) return null;

  function validateForm(): Record<string, string> {
    const errors: Record<string, string> = {};

    if (!displayName.trim()) errors.displayName = 'Display name is required.';

    if (!email.trim()) errors.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Invalid email address.';

    if (!password) errors.password = 'Password is required.';
    else if (password.length < 8) errors.password = 'At least 8 characters.';
    else {
      if (!/[A-Z]/.test(password)) errors.password = 'Need an uppercase letter.';
      else if (!/[a-z]/.test(password)) errors.password = 'Need a lowercase letter.';
      else if (!/[0-9]/.test(password)) errors.password = 'Need a digit.';
      else if (!/[^A-Za-z0-9]/.test(password)) errors.password = 'Need a special character.';
    }

    if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';

    if (accountType === 'enterprise' && !orgName.trim()) errors.orgName = 'Organization name is required.';

    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      await authRegister(
        email.trim(),
        password,
        displayName.trim(),
        accountType === 'enterprise' ? orgName.trim() : undefined,
      );
    } catch (err) {
      if (err instanceof BalanceApiError) {
        if (err.status === 409) {
          setError(err.error?.code === 'ORG_NAME_EXISTS' ? 'An organization with this name already exists.' : 'An account with this email already exists.');
        } else if (err.status >= 500) {
          setError('Service unavailable. Please try again.');
        } else {
          setError(err.error?.message || 'Registration failed. Please try again.');
        }
      } else {
        setError('Registration failed. Please try again.');
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
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <p className="text-sm text-muted-foreground">Choose your account type to get started.</p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            {/* Account type toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAccountType('individual')}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                  accountType === 'individual'
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/40'
                }`}
              >
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
                  accountType === 'individual'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  <User className="size-4" />
                </span>
                <div>
                  <p className="font-medium">Individual</p>
                  <p className="text-xs text-muted-foreground">Self-serve access</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setAccountType('enterprise')}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                  accountType === 'enterprise'
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/40'
                }`}
              >
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
                  accountType === 'enterprise'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  <Building2 className="size-4" />
                </span>
                <div>
                  <p className="font-medium">Enterprise</p>
                  <p className="text-xs text-muted-foreground">Team management</p>
                </div>
              </button>
            </div>

            <Separator />

            {/* Display name */}
            <div>
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={submitting}
                placeholder="Your name"
              />
              {fieldErrors.displayName && (
                <p className="mt-1 text-sm text-destructive">{fieldErrors.displayName}</p>
              )}
            </div>

            {/* Organization name — only for enterprise */}
            {accountType === 'enterprise' && (
              <div>
                <Label htmlFor="orgName">Organization name</Label>
                <Input
                  id="orgName"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  disabled={submitting}
                  placeholder="Your organization"
                />
                {fieldErrors.orgName && (
                  <p className="mt-1 text-sm text-destructive">{fieldErrors.orgName}</p>
                )}
              </div>
            )}

            {/* Email */}
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
              {fieldErrors.email && (
                <p className="mt-1 text-sm text-destructive">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <PasswordField
              id="password"
              label="Password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              disabled={submitting}
              placeholder="At least 8 characters"
              error={fieldErrors.password}
            />

            {/* Confirm password */}
            <PasswordField
              id="confirmPassword"
              label="Confirm password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              disabled={submitting}
              placeholder="Re-enter password"
              error={fieldErrors.confirmPassword}
            />

            {/* Server error */}
            {error && (
              <Alert role="alert" variant="destructive">{error}</Alert>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full"
            >
              {submitting ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
