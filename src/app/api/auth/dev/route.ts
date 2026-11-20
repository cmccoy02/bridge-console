import { NextResponse } from 'next/server';

import { signInAsDeveloper } from '@/lib/auth';
import { seedDemoData } from '@/lib/demo';
import { devLoginEnabled, publicUrl } from '@/lib/env';
import { json } from '@/lib/http';
import { setSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!devLoginEnabled()) {
    return json({ error: 'Not found' }, 404);
  }

  await seedDemoData();
  const user = await signInAsDeveloper();
  await setSession(user.id);
  return NextResponse.redirect(`${publicUrl()}/repos`);
}
