import { errorResponse, json } from '@/lib/http';
import { handleWebhook } from '@/lib/webhooks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    const result = await handleWebhook(
      request.headers.get('x-github-event') || '',
      raw,
      request.headers.get('x-hub-signature-256')
    );
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
