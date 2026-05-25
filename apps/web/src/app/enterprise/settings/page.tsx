'use client';

import { EnterpriseLayout } from '@/components/enterprise-layout';
import { RouteGuard } from '@/components/route-guard';
import { AccountSettings } from '@/components/settings/account-settings';
import { PageTransition } from '@/components/workspace/page-transition';

export default function EnterpriseSettingsPage() {
  return (
    <RouteGuard allowedRoles={['staff', 'reviewer', 'admin', 'system_admin']}>
      <EnterpriseLayout>
        <PageTransition>
          <AccountSettings variant="enterprise" />
        </PageTransition>
      </EnterpriseLayout>
    </RouteGuard>
  );
}
