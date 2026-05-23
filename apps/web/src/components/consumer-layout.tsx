'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { BarChart3, FileText, FolderOpen, LogOut, ReceiptText } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { Button } from './ui/button';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/utils';
import { EnvironmentBadge } from './system/environment-badge';
import { AppFooter } from './system/app-footer';
import { useSystemStatus } from '../hooks/use-system-status';

export function ConsumerLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { environment } = useSystemStatus();

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  const navLinks = [
    { href: '/app', label: 'Dashboard', icon: BarChart3 },
    { href: '/app/documents', label: 'Documents', icon: FolderOpen },
    { href: '/app/claims', label: 'Claims', icon: FileText },
  ];

  function isActive(href: string) {
    return pathname === href || (href !== '/app' && pathname?.startsWith(href));
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-5">
            <Link href="/app" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <ReceiptText className="size-5 text-primary" />
              <span className="text-base tracking-normal">Balance</span>
            </Link>
            <EnvironmentBadge environment={environment} />
            <nav className="hidden gap-1 md:flex">
              {navLinks.map((link) => (
                <Button key={link.href} asChild variant="ghost" size="sm">
                  <Link
                    href={link.href}
                    className={cn(
                      'relative gap-2',
                      isActive(link.href)
                        ? 'text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
                        : 'hover:bg-accent/15 hover:text-foreground'
                    )}
                  >
                    <link.icon className="size-4" />
                    {link.label}
                  </Link>
                </Button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user?.displayName}</span>
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
