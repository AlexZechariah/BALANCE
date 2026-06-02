'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { ChevronDown, ClipboardCheck, FileText, FolderOpen, History, LogOut, Menu, Settings, Settings2, UserCircle, Users } from 'lucide-react';
import { BalanceIcon } from './brand/BalanceIcon';
import { useAuth } from '../context/auth-context';
import { getReviewMetrics } from '../lib/api/reviews';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/utils';
import { AppFooter } from './system/app-footer';
import { roleLabel } from '@/lib/display-labels';
import { EmailVerificationNotice } from './security/email-verification-notice';

export function EnterpriseLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
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
              <BalanceIcon className="size-6" aria-hidden="true" />
              <span className="text-base tracking-normal">
                Balance Enterprise
              </span>
            </Link>
            <nav className="hidden gap-1 md:flex">
              {navLinks.map((link) => (
                <Button key={link.href} asChild variant="ghost" size="sm">
                <Link
                  href={link.href}
                  className={cn(
                    'relative gap-2',
                    pathname?.startsWith(link.href)
                      ? 'text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
                      : 'hover:bg-accent/15 hover:text-foreground'
                  )}
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
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-10 gap-2 rounded-md border border-border bg-muted/55 px-3 hover:bg-muted"
                  aria-label="Open account and navigation menu"
                >
                  <UserCircle className="size-4 text-muted-foreground" />
                  <span className="hidden max-w-36 truncate text-sm sm:inline">
                    {user?.displayName ?? 'Account'}
                    {user?.role && <span className="text-muted-foreground"> · {roleLabel(user.role)}</span>}
                  </span>
                  <Menu className="size-4 md:hidden" />
                  <ChevronDown className="hidden size-3.5 text-muted-foreground md:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuLabel>{user?.displayName ?? 'Account'}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="md:hidden">
                  {navLinks.map((link) => (
                    <DropdownMenuItem key={link.href} asChild>
                      <Link href={link.href}>
                        <link.icon className="size-4" />
                        {link.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </div>
                <DropdownMenuItem asChild>
                  <Link href="/enterprise/settings">
                    <Settings className="size-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleLogout()}>
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6 flex-1 w-full">
        <EmailVerificationNotice />
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
