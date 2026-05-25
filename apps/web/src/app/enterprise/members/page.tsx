'use client';

import { Fragment, type FormEvent, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Edit3, KeyRound, Lock, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { RouteGuard } from '../../../components/route-guard';
import { EnterpriseLayout } from '../../../components/enterprise-layout';
import { createMember, deleteMember, listMembers, resetMemberPassword, updateMember, type EnterpriseMemberRole } from '../../../lib/api/enterprise';
import type { AuthUser } from '../../../lib/api/auth';
import { BalanceApiError } from '../../../lib/api/client';
import { useAuth } from '../../../context/auth-context';
import { canDeleteEnterpriseMember, validatePasswordComplexity } from '../../../lib/role-permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { PageTransition } from '@/components/workspace/page-transition';
import { PasswordField } from '@/components/forms/password-field';
import { roleLabel } from '@/lib/display-labels';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  alertDialogActionClassName,
  alertDialogCancelClassName,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const MEMBER_ROLES: EnterpriseMemberRole[] = ['staff', 'reviewer', 'admin'];

export default function MembersPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add member form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<EnterpriseMemberRole>('staff');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit member form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<EnterpriseMemberRole>('staff');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);

  // Password reset form
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resettingMemberId, setResettingMemberId] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<AuthUser | null>(null);

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    setLoading(true);
    setError(null);
    try {
      const data = await listMembers();
      setMembers(data.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!newDisplayName.trim()) { setFormError('Display name is required.'); return; }
    if (!newEmail.trim()) { setFormError('Email is required.'); return; }
    const passwordError = validatePasswordComplexity(newPassword);
    if (passwordError) { setFormError(passwordError); return; }

    setSubmitting(true);
    try {
      await createMember(newEmail.trim(), newPassword, newDisplayName.trim(), newRole);
      setNewEmail('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('staff');
      setShowAddForm(false);
      await loadMembers();
    } catch (err) {
      if (err instanceof BalanceApiError && err.status === 409) {
        setFormError('A user with this email already exists.');
      } else {
        setFormError(err instanceof Error ? err.message : 'Failed to create member');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteMember(memberId: string) {
    setError(null);
    try {
      await deleteMember(memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete member');
    }
  }

  function startEdit(member: AuthUser) {
    setEditingId(member.id);
    setEditDisplayName(member.displayName);
    setEditEmail(member.email);
    setEditRole(member.role as EnterpriseMemberRole);
    setEditError(null);
    setResetId(null);
    setResetError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDisplayName('');
    setEditEmail('');
    setEditRole('staff');
    setEditError(null);
  }

  async function handleSaveMember(member: AuthUser) {
    setEditError(null);
    setError(null);

    if (!editDisplayName.trim()) { setEditError('Display name is required.'); return; }
    if (!editEmail.trim()) { setEditError('Email is required.'); return; }

    setSavingMemberId(member.id);
    try {
      const res = await updateMember(member.id, {
        displayName: editDisplayName.trim(),
        email: editEmail.trim(),
        role: member.id === user?.id ? undefined : editRole,
      });
      setMembers((items) => items.map((item) => (item.id === member.id ? res.member : item)));
      cancelEdit();
    } catch (err) {
      if (err instanceof BalanceApiError && err.status === 409) {
        setEditError('A user with this email already exists.');
      } else {
        setEditError(err instanceof BalanceApiError ? err.error.message : 'Failed to update member.');
      }
    } finally {
      setSavingMemberId(null);
    }
  }

  function startPasswordReset(memberId: string) {
    setResetId(memberId);
    setResetPasswordValue('');
    setResetError(null);
    setEditingId(null);
    setEditError(null);
  }

  function cancelPasswordReset() {
    setResetId(null);
    setResetPasswordValue('');
    setResetError(null);
  }

  async function handleResetPassword(memberId: string) {
    const passwordError = validatePasswordComplexity(resetPasswordValue);
    if (passwordError) { setResetError(passwordError); return; }

    setError(null);
    setResetError(null);
    setResettingMemberId(memberId);
    try {
      await resetMemberPassword(memberId, resetPasswordValue);
      cancelPasswordReset();
    } catch (err) {
      setResetError(err instanceof BalanceApiError ? err.error.message : 'Failed to reset password.');
    } finally {
      setResettingMemberId(null);
    }
  }

  return (
    <RouteGuard allowedRoles={['admin']}>
      <EnterpriseLayout>
        <PageTransition>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Team Members</h1>
                <p className="text-sm text-muted-foreground">Manage who has access to your organization.</p>
              </div>
              <Button onClick={() => setShowAddForm((v) => !v)}>
                <Plus className="size-4" />
                {showAddForm ? 'Cancel' : 'Add Member'}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">{error}</Alert>
            )}

            {/* Add member form */}
            {showAddForm && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Add Team Member</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddMember} className="grid gap-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label htmlFor="newDisplayName">Display name</Label>
                          <Input
                            id="newDisplayName"
                            value={newDisplayName}
                            onChange={(e) => setNewDisplayName(e.target.value)}
                            disabled={submitting}
                            placeholder="Staff name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="newEmail">Email</Label>
                          <Input
                            id="newEmail"
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            disabled={submitting}
                            placeholder="staff@balance.local"
                          />
                        </div>
                      </div>
                      <PasswordField
                        id="newPassword"
                        label="Password"
                        value={newPassword}
                        onChange={setNewPassword}
                        autoComplete="new-password"
                        disabled={submitting}
                        placeholder="At least 8 characters"
                      />
                      <div>
                        <Label htmlFor="newRole">Role</Label>
                        <Select value={newRole} onValueChange={(value) => setNewRole(value as EnterpriseMemberRole)} disabled={submitting}>
                          <SelectTrigger id="newRole"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MEMBER_ROLES.map((role) => (
                              <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {formError && (
                        <Alert variant="destructive">{formError}</Alert>
                      )}
                      <Button type="submit" disabled={submitting}>
                        {submitting ? 'Adding...' : 'Add Member'}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            <Separator />

            {/* Members list */}
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading members…</p>
            ) : members.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Users className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No team members yet.</p>
                <p className="text-xs text-muted-foreground">Click &quot;Add member&quot; to invite someone.</p>
              </div>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="w-[15rem] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => {
                      const canDelete = canDeleteEnterpriseMember(user, member);
                      const isEditing = editingId === member.id;
                      const isResettingPassword = resetId === member.id;
                      const isCurrentUser = member.id === user?.id;
                      return (
                        <Fragment key={member.id}>
                          <TableRow>
                            <TableCell className="min-w-52 font-medium">
                              {isEditing ? (
                                <div>
                                  <Label htmlFor={`member-name-${member.id}`} className="sr-only">Display name</Label>
                                  <Input
                                    id={`member-name-${member.id}`}
                                    value={editDisplayName}
                                    onChange={(event) => setEditDisplayName(event.target.value)}
                                    disabled={savingMemberId === member.id}
                                  />
                                </div>
                              ) : member.displayName}
                            </TableCell>
                            <TableCell className="min-w-64 text-muted-foreground">
                              {isEditing ? (
                                <div>
                                  <Label htmlFor={`member-email-${member.id}`} className="sr-only">Email</Label>
                                  <Input
                                    id={`member-email-${member.id}`}
                                    type="email"
                                    value={editEmail}
                                    onChange={(event) => setEditEmail(event.target.value)}
                                    disabled={savingMemberId === member.id}
                                  />
                                </div>
                              ) : member.email}
                            </TableCell>
                            <TableCell className="min-w-40">
                              {isEditing && !isCurrentUser ? (
                                <Select
                                  value={editRole}
                                  onValueChange={(value) => setEditRole(value as EnterpriseMemberRole)}
                                  disabled={savingMemberId === member.id}
                                >
                                  <SelectTrigger className="h-9 w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {MEMBER_ROLES.map((role) => (
                                      <SelectItem key={role} value={role}>{roleLabel(role)}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-sm text-muted-foreground">{roleLabel(member.role)}</span>
                              )}
                            </TableCell>
                            <TableCell className="min-w-60">
                              <div className="flex items-center justify-end gap-2">
                                {isEditing ? (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => handleSaveMember(member)}
                                      disabled={savingMemberId === member.id}
                                    >
                                      <Save className="size-4" />
                                      {savingMemberId === member.id ? 'Saving...' : 'Save'}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      onClick={cancelEdit}
                                      disabled={savingMemberId === member.id}
                                    >
                                      <X className="size-4" />
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(member)}>
                                      <Edit3 className="size-4" />
                                      Edit
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => startPasswordReset(member.id)}
                                      disabled={isCurrentUser}
                                    >
                                      <KeyRound className="size-4" />
                                      Reset
                                    </Button>
                                    {canDelete ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Remove ${member.displayName}`}
                                        onClick={() => setPendingDelete(member)}
                                      >
                                        <Trash2 className="size-4 text-destructive" />
                                      </Button>
                                    ) : (
                                      <TooltipProvider delayDuration={150}>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span
                                              tabIndex={0}
                                              className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                              aria-label={`${member.displayName} is protected`}
                                            >
                                              <Lock className="size-4" />
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {isCurrentUser ? 'You cannot remove your own admin account.' : 'This protected account cannot be removed.'}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          <AnimatePresence initial={false}>
                            {(isEditing && editError) && (
                              <TableRow key={`${member.id}-edit-error`}>
                                <TableCell colSpan={4}>
                                  <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.16 }}
                                  >
                                    <Alert variant="destructive">{editError}</Alert>
                                  </motion.div>
                                </TableCell>
                              </TableRow>
                            )}
                            {isResettingPassword && (
                              <TableRow key={`${member.id}-reset-password`}>
                                <TableCell colSpan={4}>
                                  <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.16 }}
                                    className="grid gap-4 rounded-md border border-border bg-muted/30 p-4 md:grid-cols-[1fr_auto] md:items-end"
                                  >
                                    <div>
                                      <PasswordField
                                        id={`reset-password-${member.id}`}
                                        label={`New password for ${member.displayName}`}
                                        value={resetPasswordValue}
                                        onChange={setResetPasswordValue}
                                        autoComplete="new-password"
                                        disabled={resettingMemberId === member.id}
                                        placeholder="At least 8 characters"
                                        error={resetError}
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            type="button"
                                            disabled={resettingMemberId === member.id}
                                            onClick={(event) => {
                                              const passwordError = validatePasswordComplexity(resetPasswordValue);
                                              if (passwordError) {
                                                event.preventDefault();
                                                setResetError(passwordError);
                                              }
                                            }}
                                          >
                                            {resettingMemberId === member.id ? 'Resetting...' : 'Reset password'}
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Reset member password?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              This changes the sign-in password for {member.email}. Share the new password through a secure channel.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel className={alertDialogCancelClassName}>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                              className={alertDialogActionClassName}
                                              onClick={() => handleResetPassword(member.id)}
                                            >
                                              Confirm reset
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                      <Button type="button" variant="secondary" onClick={cancelPasswordReset} disabled={resettingMemberId === member.id}>
                                        Cancel
                                      </Button>
                                    </div>
                                  </motion.div>
                                </TableCell>
                              </TableRow>
                            )}
                          </AnimatePresence>
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              </Card>
            )}
          </div>
        </PageTransition>
      </EnterpriseLayout>
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? `${pendingDelete.email} will lose access to this organization.` : 'This member will lose organization access.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={alertDialogCancelClassName}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={alertDialogActionClassName}
              onClick={() => pendingDelete && handleDeleteMember(pendingDelete.id)}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RouteGuard>
  );
}
