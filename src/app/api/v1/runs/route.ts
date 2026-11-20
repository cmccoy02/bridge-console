import { bearerToken, errorResponse, HttpError, json } from '@/lib/http';
import { ingestRun } from '@/lib/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const raw = await request.text();

    if (raw.length > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Run report too large.');
    }

    let body: unknown;

    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'Body must be JSON: { "report": { ... } }');
    }

    const result = await ingestRun(bearerToken(request), body);
    return json(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
