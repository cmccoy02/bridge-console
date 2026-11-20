import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { completeGitHubSignIn } from '@/lib/auth';
import { timingSafeEqualStrings } from '@/lib/crypto';
import { publicUrl } from '@/lib/env';
import { setSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const store = await cookies();
  const expected = store.get('bridge_oauth_state')?.value || '';
  store.delete('bridge_oauth_state');

  if (!code || !state || !expected || !timingSafeEqualStrings(state, expected)) {
    return NextResponse.redirect(`${publicUrl()}/?error=signin`);
  }

  try {
    const user = await completeGitHubSignIn(code, `${publicUrl()}/api/auth/github/callback`);
    await setSession(user.id);
    return NextResponse.redirect(`${publicUrl()}/repos`);
  } catch (error) {
    console.error('GitHub sign-in failed', error);
    return NextResponse.redirect(`${publicUrl()}/?error=signin`);
  }
}
