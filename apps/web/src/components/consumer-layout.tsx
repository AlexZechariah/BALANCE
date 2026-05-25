'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { BarChart3, ChevronDown, FolderOpen, Lightbulb, LogOut, Settings, UserCircle, WalletCards } from 'lucide-react';
import { BalanceIcon } from './brand/BalanceIcon';
import { useAuth } from '../context/auth-context';
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

export function ConsumerLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  const navLinks = [
    { href: '/app', label: 'Dashboard', icon: BarChart3 },
    { href: '/app/documents', label: 'Documents', icon: FolderOpen },
    { href: '/app/insights', label: 'Insights', icon: Lightbulb },
    { href: '/app/budget', label: 'Budget', icon: WalletCards },
  ].filter((link) => user?.role === 'consumer' || (link.href !== '/app/insights' && link.href !== '/app/budget'));

  function isActive(href: string) {
    return pathname === href || (href !== '/app' && pathname?.startsWith(href));
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-5">
            <Link href="/app" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <BalanceIcon className="size-6" aria-hidden="true" />
              <span className="text-base tracking-normal">Balance</span>
            </Link>
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
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-10 gap-2 rounded-md border border-border bg-muted/55 px-3 hover:bg-muted"
                  aria-label="Open account menu"
                >
                  <UserCircle className="size-4 text-muted-foreground" />
                  <span className="max-w-28 truncate text-sm">{user?.displayName ?? 'Account'}</span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuLabel>{user?.displayName ?? 'Account'}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/app/settings">
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
      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 lg:px-6 md:pb-6 flex-1 w-full">{children}</main>
      <AppFooter />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 py-2 shadow-lg backdrop-blur md:hidden" aria-label="Consumer navigation">
        <div className="grid grid-cols-4 gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium text-muted-foreground',
                isActive(link.href) && 'bg-primary/10 text-primary'
              )}
            >
              <link.icon className="size-4" />
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
