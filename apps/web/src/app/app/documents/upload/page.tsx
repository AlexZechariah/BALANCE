'use client';

import { RouteGuard } from '../../../../components/route-guard';
import { ConsumerLayout } from '../../../../components/consumer-layout';
import { DocumentUploadForm } from '@/components/document/document-upload-form';
import { PageTransition } from '@/components/workspace/page-transition';

export default function UploadPage() {
  return (
    <RouteGuard allowedRoles={['consumer', 'staff', 'admin']}>
      <ConsumerLayout>
        <PageTransition>
          <DocumentUploadForm mode="consumer" />
        </PageTransition>
      </ConsumerLayout>
    </RouteGuard>
  );
}
