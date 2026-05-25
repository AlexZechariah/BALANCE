import { Badge } from '@/components/ui/badge';
import { statusLabel } from '@/lib/display-labels';

const statusVariants: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  uploaded: 'neutral',
  queued: 'warning',
  processing: 'info',
  extracted: 'success',
  correction_required: 'warning',
  corrected: 'info',
  submitted: 'info',
  reviewed: 'success',
  rejected: 'danger',
  failed: 'danger',
  pending: 'warning',
  in_review: 'info',
  approved: 'success',
  under_review: 'info',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={statusVariants[status] ?? 'default'}
      className="min-h-9 min-w-24 justify-center whitespace-nowrap px-3"
    >
      {statusLabel(status)}
    </Badge>
  );
}
