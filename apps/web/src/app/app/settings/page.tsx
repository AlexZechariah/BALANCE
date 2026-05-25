'use client';

import { RouteGuard } from '@/components/route-guard';
import { ConsumerLayout } from '@/components/consumer-layout';
import { AccountSettings } from '@/components/settings/account-settings';
import { PageTransition } from '@/components/workspace/page-transition';

export default function ConsumerSettingsPage() {
  return (
    <RouteGuard allowedRoles={['consumer', 'staff', 'admin']}>
      <ConsumerLayout>
        <PageTransition>
          <AccountSettings variant="consumer" />
        </PageTransition>
      </ConsumerLayout>
    </RouteGuard>
  );
}
