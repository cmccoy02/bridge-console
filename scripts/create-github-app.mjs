#!/usr/bin/env node
// Creates the Bridge GitHub App from a manifest (GitHub's pre-filled "new app" form)
// and saves its credentials to .env.github-app on this machine. Nothing is uploaded
// anywhere else; copy the values into your hosting provider's environment settings.
//
//   npm run setup:github-app -- --url https://your-console.vercel.app [--org your-org] [--name "Bridge"]

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';

const args = process.argv.slice(2);
const option = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const consoleUrl = option('url').replace(/\/+$/, '');
const org = option('org');
const name = option('name', 'Bridge');
const port = Number(option('port', '3456'));

if (!/^https:\/\//.test(consoleUrl)) {
  console.error('Pass the public HTTPS URL of your Bridge console: --url https://your-console.vercel.app');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const manifest = {
  name,
  url: consoleUrl,
  description: 'Keeps dependencies patched. Opens a pull request only after the update passes your checks.',
  hook_attributes: { url: `${consoleUrl}/api/github/webhooks`, active: true },
  redirect_url: `http://localhost:${port}/callback`,
  callback_urls: [`${consoleUrl}/api/auth/github/callback`, 'http://localhost:3000/api/auth/github/callback'],
  setup_url: `${consoleUrl}/repos`,
  setup_on_update: true,
  request_oauth_on_install: false,
  public: true,
  // Deliberately no `workflows` permission: GitHub then refuses any push that touches
  // .github/workflows, even if something went wrong upstream.
  default_permissions: { contents: 'write', pull_requests: 'write', metadata: 'read' },
  default_events: ['pull_request']
};
const createUrl = org
  ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new?state=${state}`
  : `https://github.com/settings/apps/new?state=${state}`;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const page = (body) => `<!doctype html><meta charset="utf-8"><title>Bridge GitHub App</title>
<body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; line-height: 1.5">${body}</body>`;

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://localhost:${port}`);

  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      page(`<h1>Create the Bridge GitHub App</h1>
<p>GitHub will show a pre-filled form for <strong>${escapeHtml(name)}</strong>${org ? ` in <strong>${escapeHtml(org)}</strong>` : ''}. Review it and click <em>Create GitHub App</em>.</p>
<form id="f" method="post" action="${escapeHtml(createUrl)}">
<input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">
<button type="submit" style="font-size:1rem;padding:.6rem 1rem">Continue to GitHub</button>
</form>`)
    );
    return;
  }

  if (url.pathname === '/callback') {
    if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) {
      response.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      response.end(page('<p>That callback did not come from this setup run. Start again.</p>'));
      return;
    }

    try {
      const conversion = await fetch(
        `https://api.github.com/app-manifests/${encodeURIComponent(url.searchParams.get('code'))}/conversions`,
        { method: 'POST', headers: { accept: 'application/vnd.github+json' } }
      );

      if (!conversion.ok) {
        throw new Error(`GitHub answered HTTP ${conversion.status}: ${await conversion.text()}`);
      }

      const app = await conversion.json();
      const lines = [
        `GITHUB_APP_ID=${app.id}`,
        `GITHUB_APP_SLUG=${app.slug}`,
        `GITHUB_APP_CLIENT_ID=${app.client_id}`,
        `GITHUB_APP_CLIENT_SECRET=${app.client_secret}`,
        `GITHUB_WEBHOOK_SECRET=${app.webhook_secret}`,
        `GITHUB_APP_PRIVATE_KEY=${Buffer.from(app.pem).toString('base64')}`
      ];
      await fs.writeFile('.env.github-app', `${lines.join('\n')}\n`, { mode: 0o600 });

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        page(`<h1>Created ${escapeHtml(app.slug)}</h1>
<p>The credentials are saved in <code>.env.github-app</code> in your bridge-console folder. You can close this tab.</p>
<p>Next: add those six values to your hosting environment, redeploy, then install the app:
<a href="${escapeHtml(app.html_url)}/installations/new">${escapeHtml(app.html_url)}/installations/new</a></p>`)
      );
      console.log(`\nCreated GitHub App "${app.slug}" (id ${app.id}).`);
      console.log('Credentials saved to .env.github-app (keep it private; it is gitignored).');
      console.log('Next: add each line to Vercel (Project settings > Environment Variables), redeploy,');
      console.log(`then install the app: ${app.html_url}/installations/new\n`);
      setTimeout(() => process.exit(0), 300);
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
      response.end(page(`<p>Could not finish creating the app: ${escapeHtml(error.message)}</p>`));
      console.error(error);
    }

    return;
  }

  response.writeHead(404);
  response.end();
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Open http://localhost:${port} in your browser to create the Bridge GitHub App.`);
});
