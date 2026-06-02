import { isInternalMetricsRequest, webMetrics } from '@/lib/observability/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  if (!isInternalMetricsRequest(request)) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(await webMetrics.render(), {
    headers: {
      'Content-Type': webMetrics.contentType,
      'Cache-Control': 'no-store',
    },
  });
}
