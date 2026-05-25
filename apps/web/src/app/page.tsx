'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, ClipboardCheck, FileSearch, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuth } from '@/context/auth-context';
import { homeForRole } from '@/lib/auth-routing';
import { PageTransition } from '@/components/workspace/page-transition';
import { BalanceIcon } from '@/components/brand/BalanceIcon';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    router.replace(homeForRole(user.role));
  }, [loading, router, user]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 lg:px-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BalanceIcon className="size-5" aria-hidden="true" />
            Balance
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="secondary">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </header>

        <PageTransition>
          <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="max-w-xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-primary" />
                Evidence-ready document review
              </div>
              <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
                Balance
              </h1>
              <p className="mt-5 max-w-[58ch] text-base leading-7 text-muted-foreground">
                Capture receipts and invoices, verify the values that matter, and keep every document tied to spend insights, review decisions, and audit history.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/login">
                    Open Balance
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/login">Review Evidence</Link>
                </Button>
              </div>
              <div className="mt-8 grid grid-cols-3 gap-3 text-sm">
                {[
                  ['1', 'Source file'],
                  ['8', 'Verified fields'],
                  ['3', 'Audit events'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-md border border-border bg-card px-3 py-2">
                    <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-lg border border-border bg-card p-3 shadow-sm"
            >
              <div className="grid gap-3 lg:grid-cols-[0.82fr_1.18fr]">
                <div className="overflow-hidden rounded-md border border-border bg-background">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">Nomad-Receipt.pdf</p>
                      <p className="text-xs text-muted-foreground">Page 1 of 1</p>
                    </div>
                    <Badge variant="success">Extracted</Badge>
                  </div>
                  <div className="grid min-h-[360px] place-items-center bg-muted/35 p-5">
                    <div className="w-full max-w-[210px] rotate-[-1deg] rounded-sm border border-border bg-white p-4 text-[8px] leading-3 text-slate-800 shadow-sm">
                      <p className="mb-3 text-center font-bold tracking-[0.18em]">INVOICE</p>
                      <p className="font-semibold">Nomad Supplies</p>
                      <p className="mb-2">Petaling Jaya, Selangor</p>
                      <div className="grid gap-1 border-y border-slate-200 py-2">
                        <p>Logitech MK570 Combo <span className="float-right">89.00</span></p>
                        <p>Anker PowerExpand 7-in-1 <span className="float-right">55.00</span></p>
                        <p>Shipping charge <span className="float-right">8.50</span></p>
                        <p>Discount <span className="float-right">-15.00</span></p>
                      </div>
                      <p className="mt-3 text-right font-bold">RM 137.50</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 rounded-md border border-border bg-background/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Document Information</p>
                      <p className="text-xs text-muted-foreground">Electronics · Work Equipment · Updated 2 hours ago</p>
                    </div>
                    <Badge variant="neutral">Ready</Badge>
                  </div>
                  <div className="grid gap-2 text-sm">
                    {[
                      ['Merchant', 'Nomad Supplies', '99%'],
                      ['Subtotal', 'RM 144.00', '100%'],
                      ['Discount', '-RM 15.00', '92%'],
                      ['Service', 'RM 0.00', 'Verified'],
                      ['Total', 'RM 137.50', '100%'],
                    ].map(([label, value, status]) => (
                      <div key={label} className="grid grid-cols-[1fr_auto_auto] gap-3 rounded-md border border-border bg-card px-3 py-2">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{value}</span>
                        <span className="font-mono text-xs text-primary">{status}</span>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-2 rounded-md border border-border bg-card p-3">
                    {[
                      { icon: FileSearch, label: 'Values checked against page evidence' },
                      { icon: ClipboardCheck, label: 'Review state recorded' },
                      { icon: ShieldCheck, label: 'Audit activity preserved' },
                    ].map((item, index) => (
                      <div key={item.label} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-sm">
                        <item.icon className="size-4 text-primary" />
                        <span>{item.label}</span>
                        <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {[
                  ['Spend Insights', 'Category and merchant totals stay tied to source documents.'],
                  ['Review Queue', 'Enterprise decisions sit above raw extraction details.'],
                  ['Audit Trail', 'Corrections, deletion attempts, and outcomes are recorded.'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-border bg-background/60 p-3">
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{value}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </section>
        </PageTransition>
      </div>
    </main>
  );
}
