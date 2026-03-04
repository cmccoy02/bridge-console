import { getStoredToken, getAuthHeaders, apiFetch, apiGet, apiPost, apiPut, apiDelete } from '../../utils/api';

const AUTH_TOKEN_KEY = 'bridge_auth_token';

// ─────────────────────────────────────────────
// localStorage helpers
// ─────────────────────────────────────────────

describe('getStoredToken', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when no token is stored', () => {
    expect(getStoredToken()).toBeNull();
  });

  it('returns the stored token string', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'test-token-abc');
    expect(getStoredToken()).toBe('test-token-abc');
  });
});

// ─────────────────────────────────────────────
// getAuthHeaders
// ─────────────────────────────────────────────

describe('getAuthHeaders', () => {
  beforeEach(() => localStorage.clear());

  it('returns an empty object when no token is stored', () => {
    expect(getAuthHeaders()).toEqual({});
  });

  it('returns Authorization: Bearer header when token is stored', () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'my-jwt-token');
    expect(getAuthHeaders()).toEqual({ Authorization: 'Bearer my-jwt-token' });
  });
});

// ─────────────────────────────────────────────
// apiFetch
// ─────────────────────────────────────────────

describe('apiFetch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls fetch with credentials: include', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}', { status: 200 }));
    await apiFetch('/api/test');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('includes Authorization header when token is present', async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'bearer-token-xyz');
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}', { status: 200 }));
    await apiFetch('/api/repos');
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.headers).toMatchObject({ Authorization: 'Bearer bearer-token-xyz' });
  });

  it('does NOT include Authorization header when no token', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}', { status: 200 }));
    await apiFetch('/api/repos');
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.headers?.Authorization).toBeUndefined();
  });

  it('passes through a full URL unchanged', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}', { status: 200 }));
    await apiFetch('https://example.com/api/data');
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://example.com/api/data');
  });

  it('prepends API_URL for relative paths', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}', { status: 200 }));
    await apiFetch('/api/health');
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/\/api\/health$/);
  });
});

// ─────────────────────────────────────────────
// Convenience methods
// ─────────────────────────────────────────────

describe('convenience methods', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('apiGet issues a GET request', async () => {
    await apiGet('/api/repos');
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    // Default fetch method is GET (undefined means GET)
    expect(options?.method ?? 'GET').toBe('GET');
  });

  it('apiPost issues a POST with JSON body', async () => {
    await apiPost('/api/repos', { url: 'https://github.com/foo/bar' });
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(options.body)).toEqual({ url: 'https://github.com/foo/bar' });
  });

  it('apiPut issues a PUT with JSON body', async () => {
    await apiPut('/api/repos/1', { name: 'updated' });
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body)).toEqual({ name: 'updated' });
  });

  it('apiDelete issues a DELETE request', async () => {
    await apiDelete('/api/repos/1');
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.method).toBe('DELETE');
  });

  it('apiPost with no body sends no body', async () => {
    await apiPost('/api/scan');
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.body).toBeUndefined();
  });
});
