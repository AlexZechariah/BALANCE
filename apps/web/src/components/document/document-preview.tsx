'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const DocumentPreview = dynamic(
  () => import('./document-preview-inner').then((mod) => mod.DocumentPreviewInner),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[520px] grid-rows-[auto_1fr] overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-3 py-2">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid place-items-center overflow-auto bg-muted/45 p-4">
          <Skeleton className="h-full min-h-96 w-full" />
        </div>
      </div>
    ),
  }
);
