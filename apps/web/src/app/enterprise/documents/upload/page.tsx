'use client';

import { RouteGuard } from '../../../../components/route-guard';
import { EnterpriseLayout } from '../../../../components/enterprise-layout';
import { DocumentUploadForm } from '@/components/document/document-upload-form';
import { PageTransition } from '@/components/workspace/page-transition';

export default function EnterpriseUploadPage() {
  return (
    <RouteGuard allowedRoles={['staff', 'admin']}>
      <EnterpriseLayout>
        <PageTransition>
          <DocumentUploadForm mode="enterprise" />
        </PageTransition>
      </EnterpriseLayout>
    </RouteGuard>
  );
}
