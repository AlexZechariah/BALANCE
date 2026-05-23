'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { ClipboardCheck, FileText, FolderOpen, History, LogOut, Settings2, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { getReviewMetrics } from '../lib/api/reviews';
import { Button } from './ui/button';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/utils';
import { EnvironmentBadge } from './system/environment-badge';
import { AppFooter } from './system/app-footer';
import { useSystemStatus } from '../hooks/use-system-status';

export function EnterpriseLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { environment } = useSystemStatus();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user || !['reviewer', 'admin', 'system_admin'].includes(user.role)) return;
    getReviewMetrics()
      .then(res => setPendingCount(res.metrics.pendingQueueSize))
      .catch(() => {});
  }, [user]);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  const navLinks = [
    { href: '/enterprise/documents', label: 'Documents', roles: ['staff', 'admin'], icon: FolderOpen },
    { href: '/enterprise/claims', label: 'Claims', roles: ['staff', 'admin', 'reviewer'], icon: FileText },
    { href: '/enterprise/reviews', label: 'Review Queue', roles: ['reviewer', 'admin', 'system_admin'], icon: ClipboardCheck },
    { href: '/enterprise/members', label: 'Members', roles: ['admin'], icon: Users },
    { href: '/admin/audit', label: 'Audit Log', roles: ['admin', 'system_admin'], icon: History },
    { href: '/app/admin', label: 'Admin', roles: ['system_admin'], icon: Settings2 },
  ].filter(link => user && link.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-5">
            <Link href="/enterprise/documents" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <ShieldCheck className="size-5 text-info" />
              <span className="text-base tracking-normal">
                Balance <span className="font-serif tracking-tight">Enterprise</span>
              </span>
            </Link>
            <EnvironmentBadge environment={environment} />
            <nav className="hidden gap-1 md:flex">
              {navLinks.map((link) => (
                <Button key={link.href} asChild variant="ghost" size="sm">
                <Link
                  href={link.href}
                  className={cn('gap-2', pathname?.startsWith(link.href) ? 'bg-muted text-foreground' : 'text-muted-foreground')}
                >
                  <link.icon className="size-4" />
                  {link.label}
                  {link.href === '/enterprise/reviews' && pendingCount != null && pendingCount > 0 && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ml-1">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </Link>
                </Button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user?.displayName} · <strong className="capitalize">{user?.role?.replace('_', ' ')}</strong></span>
            <ThemeToggle />
            <Button type="button" variant="secondary" size="sm" onClick={handleLogout}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6 flex-1 w-full">{children}</main>
      <AppFooter />
    </div>
  );
}
