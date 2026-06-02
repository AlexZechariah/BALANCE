import { handleClientTelemetryRequest } from '@/lib/observability/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleClientTelemetryRequest(request);
}
