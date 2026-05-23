export interface ChangelogEntry {
  version: string;
  date: string;
  sections: Array<{
    title: string;
    items: string[];
  }>;
}

export const changelog: ChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-05-18',
    sections: [
      {
        title: 'Deployment automation',
        items: [
          'CI-gated automatic staging deployment from develop branch.',
          'Manual production deployment from main branch with required approval.',
          'Route-level smoke checks verify frontend and API routes after every deployment.',
          'Deployment manifests generated and uploaded as GitHub Actions artifacts for full traceability.',
          'Clean AWS SSM deployment logs with failure diagnostics.',
        ],
      },
      {
        title: 'Platform reliability',
        items: [
          'PostgreSQL database backup runs automatically before every migration on staging and production.',
          'Environment-specific backup retention cleanup keeps storage costs predictable.',
          'Manual version-safe staging rollback with post-rollback redeployment proof.',
          'Production /api/version verification confirms the correct build is live after every release.',
        ],
      },
      {
        title: 'Consumer workflow',
        items: [
          'Upload receipts, invoices, and transaction documents (PDF, JPG, PNG up to 10 MB).',
          'Automatic OCR extraction with real-time status polling.',
          'Correction form for all extracted fields — stays editable until claim is submitted.',
          'Submit claims with purpose and optional note.',
          'Track claim status through the full review cycle.',
        ],
      },
      {
        title: 'Enterprise review workflow',
        items: [
          'Review queue for submitted claims.',
          'Full document field review with audit timeline.',
          'Claim, approve, or reject with required rejection note.',
          'Admin audit log with full system event history and pagination.',
        ],
      },
      {
        title: 'Desktop client',
        items: [
          'Reviewer and admin desktop app for the enterprise review workflow.',
          'Configurable API base URL for local and production environments.',
        ],
      },
      {
        title: 'Observability',
        items: [
          'Prometheus, Grafana, and cAdvisor monitoring stack on the production server.',
          'Host CPU, memory, disk, and network dashboards.',
          'Per-container CPU and memory dashboards.',
          'node_exporter running as a native host service for accurate EC2 metrics.',
        ],
      },
    ],
  },
];
