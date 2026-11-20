import crypto from 'node:crypto';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { githubAppConfig, publicUrl } from '@/lib/env';
import { authorizeUrl } from '@/lib/github-app';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!githubAppConfig().clientId) {
    return json({ error: 'GitHub sign-in is not configured (GITHUB_APP_CLIENT_ID).' }, 503);
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const store = await cookies();
  store.set('bridge_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600
  });
  return NextResponse.redirect(authorizeUrl(state, `${publicUrl()}/api/auth/github/callback`));
}
