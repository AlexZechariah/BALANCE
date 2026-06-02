'use client';

import { useReportWebVitals } from 'next/web-vitals';

import { recordWebVital } from '@/lib/observability/client';

type ReportWebVitalsCallback = Parameters<typeof useReportWebVitals>[0];

const reportWebVitals: ReportWebVitalsCallback = (metric) => {
  recordWebVital(metric);
};

export function WebVitalsReporter() {
  useReportWebVitals(reportWebVitals);
  return null;
}
