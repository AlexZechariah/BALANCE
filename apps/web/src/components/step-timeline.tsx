'use client';

import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';

export interface StepTimelineStep {
  label: string;
  timestamp?: string | null;
  description?: string | null;
  status: 'completed' | 'current' | 'pending' | 'failed';
}

interface StepTimelineProps {
  steps: StepTimelineStep[];
  variant?: 'default' | 'compact';
}

/** Formats a timestamp as a relative string for the compact variant. */
function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDateTime(iso);
}

export function StepTimeline({ steps, variant = 'default' }: StepTimelineProps) {
  if (variant === 'compact') {
    return (
      <div>
        {steps.map((step, index) => (
          <div
            key={index}
            className="flex items-center gap-2 py-1.5"
          >
            {/* Step icon */}
            <div
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-full',
                step.status === 'completed' && 'bg-success',
                step.status === 'current' && 'bg-primary',
                step.status === 'failed' && 'bg-destructive',
                step.status === 'pending' && 'border-2 border-muted-foreground',
              )}
            >
              {step.status === 'completed' && (
                <Check className="size-2.5 text-white" strokeWidth={3} />
              )}
              {step.status === 'current' && (
                <div className="size-1.5 rounded-full bg-white" />
              )}
              {step.status === 'failed' && (
                <X className="size-2.5 text-white" strokeWidth={3} />
              )}
              {step.status === 'pending' && (
                <div className="size-1.5 rounded-full bg-muted-foreground" />
              )}
            </div>

            {/* Label */}
            <span
              className={cn(
                'text-sm',
                step.status === 'current' && 'font-medium text-primary',
                step.status === 'completed' && 'text-muted-foreground',
                step.status === 'pending' && 'text-muted-foreground',
                step.status === 'failed' && 'text-destructive',
              )}
            >
              {step.label}
            </span>

            {/* Relative timestamp pushed right */}
            {step.timestamp && (
              <span className="ml-auto text-xs text-muted-foreground">
                {formatRelativeTime(step.timestamp)}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── default variant (spacious, consumer page) ──────────────────────
  return (
    <div>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        return (
          <div key={index} className={cn('relative flex gap-3', !isLast && 'pb-8')}>
            {/* ── Icon column ─────────────────────────────────── */}
            <div className="flex flex-col items-center">
              {/* Circle icon */}
              <div
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full',
                  step.status === 'completed' && 'bg-success',
                  step.status === 'current' && 'bg-primary',
                  step.status === 'failed' && 'bg-destructive',
                  step.status === 'pending' && 'border-2 border-muted-foreground',
                )}
              >
                {step.status === 'completed' && (
                  <Check className="size-3 text-white" strokeWidth={3} />
                )}
                {step.status === 'current' && (
                  <div className="size-2 rounded-full bg-white animate-pulse-dot" />
                )}
                {step.status === 'failed' && (
                  <X className="size-3 text-white" strokeWidth={3} />
                )}
                {step.status === 'pending' && (
                  <div className="size-2 rounded-full bg-muted-foreground" />
                )}
              </div>

              {/* Vertical connector line */}
              {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>

            {/* ── Content column ─────────────────────────────── */}
            <div className="flex-1 pt-0.5">
              {/* Label */}
              <p
                className={cn(
                  'text-sm leading-5',
                  step.status === 'current' && 'font-semibold text-foreground',
                  step.status === 'completed' && 'text-muted-foreground',
                  step.status === 'failed' && 'text-destructive',
                  step.status === 'pending' && 'text-muted-foreground',
                )}
              >
                {step.label}
              </p>

              {/* Timestamp */}
              {step.timestamp && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {formatDateTime(step.timestamp)}
                </p>
              )}

              {/* Description shown only on completed or current steps. */}
              {step.description &&
                (step.status === 'completed' || step.status === 'current') && (
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground/80">
                    {step.description}
                  </p>
                )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
