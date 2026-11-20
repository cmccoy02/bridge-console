import { issueRepositoryToken } from '@/lib/broker';
import { bearerToken, errorResponse, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { repository?: unknown };
    const requested = typeof body.repository === 'string' ? body.repository : '';
    return json(await issueRepositoryToken(bearerToken(request), requested));
  } catch (error) {
    return errorResponse(error);
  }
}
