import { NextResponse } from 'next/server';

import { publicUrl } from '@/lib/env';
import { clearSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  await clearSession();
  return NextResponse.redirect(`${publicUrl()}/`, { status: 303 });
}
