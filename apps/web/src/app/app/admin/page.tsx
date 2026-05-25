'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, DatabaseZap } from 'lucide-react';
import { deleteAllDocuments } from '../../../lib/api/documents';
import { RouteGuard } from '../../../components/route-guard';
import { BalanceApiError } from '../../../lib/api/client';
import { EnterpriseLayout } from '../../../components/enterprise-layout';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdminPage() {
  return (
    <RouteGuard allowedRoles={['system_admin']}>
      <AdminContent />
    </RouteGuard>
  );
}

function AdminContent() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState<{ deletedCount: number; claimCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    if (confirmText !== 'RESET') return;
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteAllDocuments();
      setDone(result);
    } catch (err) {
      const message = err instanceof BalanceApiError ? err.error.message || 'Reset failed' : 'Reset failed';
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  if (done) {
    return (
      <EnterpriseLayout>
        <div className="mx-auto max-w-2xl">
          <Alert variant="success">
            <CheckCircle2 className="size-4" />
            <div>
              <p className="font-medium">Reset complete</p>
              <p className="mt-1 text-sm">
                Deleted {done.deletedCount} documents and {done.claimCount} claims. Audit entries remain retained without deleted document foreign keys.
              </p>
            </div>
          </Alert>
          <Button type="button" className="mt-5" onClick={() => router.push('/app/documents')}>
            Go to documents
          </Button>
        </div>
      </EnterpriseLayout>
    );
  }

  return (
    <EnterpriseLayout>
      <div className="mx-auto grid max-w-3xl gap-6">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <DatabaseZap className="size-4" />
            Admin Console
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">System Danger Zone</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Bulk reset is intentionally isolated from the review and audit queues. It should only be used for local demo cleanup.
          </p>
        </div>

        <Card className="border-destructive/35">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              Reset All Data
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Alert variant="destructive">
              This permanently deletes all documents and claims. Audit history is retained for compliance, but document records and claim records are removed.
            </Alert>

            {error && <Alert variant="destructive">{error}</Alert>}

            <div className="grid gap-2">
              <Label htmlFor="reset-confirm">Type <span className="font-semibold">RESET</span> to confirm</Label>
              <Input
                id="reset-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESET"
                disabled={deleting}
              />
            </div>

            <Button
              type="button"
              variant="destructive"
              onClick={handleReset}
              disabled={confirmText !== 'RESET' || deleting}
            >
              {deleting ? 'Deleting…' : 'Permanently delete all data'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </EnterpriseLayout>
  );
}
