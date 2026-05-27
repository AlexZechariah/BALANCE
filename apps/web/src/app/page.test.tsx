import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoutePlaceholderShell } from '../components/route-placeholder-shell';
import HomePage from './page';

// Mock client-only dependencies so HomePage can render in a server context.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({ user: null, loading: true }),
}));

vi.mock('@/components/theme-toggle', () => ({
  ThemeToggle: () => null,
}));

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('HomePage (live landing page)', () => {
  it('renders the landing page header and hero content', () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain('Balance');
    expect(html).not.toContain('Balance receipt records');
    expect(html).not.toContain('workspace');
    expect(html).toContain('Evidence-ready document review');
    expect(html).toContain('Capture receipts and invoices');
    expect(html).toContain('Open Balance');
    expect(html).toContain('Review Evidence');
    expect(html).toContain('Sign in');
    expect(html).toContain('Document Information');
    expect(html).toContain('Spend Insights');
    expect(html).toContain('Review Queue');
    expect(html).toContain('Audit Trail');
  });
});

describe('RoutePlaceholderShell', () => {
  it('renders the home experience with routing and proxy-friendly API paths', () => {
    process.env.APP_ENV = 'staging';
    process.env.API_PROXY_TARGET = 'http://api:3001';
    process.env.NEXT_PUBLIC_API_HEALTH_PATH = '/gateway/health';
    process.env.NEXT_PUBLIC_API_VERSION_PATH = '/gateway/version';
    process.env.OBJECT_STORAGE_PROVIDER = 'filesystem';
    process.env.STORAGE_DRIVER = 'filesystem';

    const html = renderToStaticMarkup(
      <RoutePlaceholderShell
        routePath="/"
        routeTitle="Landing page"
        routeSummary="A public overview of the document workflow platform."
      />
    );

    expect(html).toContain('Balance');
    expect(html).toContain('structured document system');
    expect(html).toContain('STAGING');
    expect(html).toContain('Route');
    expect(html).toContain('role gateway');
    expect(html).toContain('/login');
    expect(html).toContain('/app');
    expect(html).toContain('/gateway/health');
    expect(html).toContain('/gateway/version');
    expect(html).not.toContain('http://api:3001');
  });

  it('renders the login placeholder route', () => {
    process.env.APP_ENV = 'production';
    process.env.OBJECT_STORAGE_PROVIDER = 'filesystem';
    process.env.STORAGE_DRIVER = 'filesystem';

    const html = renderToStaticMarkup(
      <RoutePlaceholderShell
        routePath="/login"
        routeTitle="Login page"
        routeSummary="A secure entry route for Balance users."
      />
    );

    expect(html).toContain('PRODUCTION');
    expect(html).toContain('/login');
    expect(html).toContain('Login page');
  });

  it('renders the app placeholder route', () => {
    process.env.APP_ENV = 'local';

    const html = renderToStaticMarkup(
      <RoutePlaceholderShell
        routePath="/app"
        routeTitle="Application"
        routeSummary="A product route for document review and record management."
      />
    );

    expect(html).toContain('LOCAL');
    expect(html).toContain('/app');
    expect(html).toContain('Application');
  });
});
