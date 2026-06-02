import { recordNavigation } from './lib/observability/client';

export function onRouterTransitionStart(
  url: string,
  navigationType: 'push' | 'replace' | 'traverse',
): void {
  recordNavigation(url, navigationType);
}
