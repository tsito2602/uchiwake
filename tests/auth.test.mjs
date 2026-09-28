import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SignJWT, decodeJwt, exportJWK, generateKeyPair } from 'jose';
import app from '../dist/worker.mjs';
import { authEnv, auth, sessionCookie } from './auth-fixture.mjs';
const env = { ...authEnv, APP_ENV: 'staging', DB: { prepare() { assert.fail('Authentication must not query household data'); } } };
const origin = 'https://example.test';
const request = (path, options = {}, bindings = env) => app.fetch(new Request(`${origin}${path}`, options), bindings);
const cookieHeader = response => response.headers.get('set-cookie')?.split(';')[0];

test('public login shell, assets and session status are available without exposing household data', async () => {
  for (const path of ['/', '/logo-light.svg', '/logo-dark.svg']) assert.equal((await request(path)).status, 200);
  const response = await request('/api/auth/session');
  assert.deepEqual(await response.json(), { user: null, configured: true });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  for (const path of ['/api/state?month=2026-09', '/api/settlement-history?month=2026-09', '/api/state?month=2026-09&demo=1']) {
    const denied = await request(path);
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get('www-authenticate'), null);
  }
  assert.equal((await request('/api/auth/unknown')).status, 404);
});
test('incomplete configuration fails closed and old Basic credentials cannot bypass Google authentication', async () => {
  for (const missing of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET', 'ALLOWED_EMAILS']) {
    const bindings = { ...env, [missing]: '' };
    assert.equal((await (await request('/api/auth/session', {}, bindings)).json()).configured, false);
    assert.equal((await request('/api/state?month=2026-09', {}, bindings)).status, 503);
  }
  assert.equal((await request('/api/state?month=2026-09', { headers: { Authorization: 'Basic ' + btoa('user:pw') } }, { ...env, APP_PASSWORD: 'pw' })).status, 401);
});
test('valid session identifies the user; revoked allowlist, tampering, expiry and wrong audience are denied', async () => {
  const response = await request('/api/auth/session', { headers: { Cookie: auth } });
  assert.equal((await response.json()).user.id, 'google-test-id');
  const sign = payload => new SignJWT({ purpose: 'session', sub: 'id', email: 'member@example.test', ...payload }).setProtectedHeader({ alg: 'HS256' }).setIssuer('uchiwake').setIssuedAt().sign(new TextEncoder().encode(authEnv.SESSION_SECRET));
  const expired = await sign({ aud: origin, exp: Math.floor(Date.now()/1000)-1 });
  const wrongOrigin = await sign({ aud: 'https://other.test', exp: Math.floor(Date.now()/1000)+60 });
  for (const cookie of [auth + 'tampered', `__Host-uchiwake_session=${expired}`, `__Host-uchiwake_session=${wrongOrigin}`, await sessionCookie({ purpose: 'oauth' })]) {
    assert.equal((await request('/api/state?month=2026-09', { headers: { Cookie: cookie } })).status, 401);
  }
  assert.equal((await request('/api/state?month=2026-09', { headers: { Cookie: auth } }, { ...env, ALLOWED_EMAILS: 'someone-else@example.test' })).status, 401);
});
test('mutating APIs and logout require a same-origin JSON request; logout clears both secure cookies', async () => {
  for (const site of [undefined, 'https://attacker.test']) {
    assert.equal((await request('/api/auth/logout', { method: 'POST', headers: { Cookie: auth, ...(site ? { Origin: site } : {}), 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await request('/api/bills/id', { method: 'DELETE', headers: { Cookie: auth, ...(site ? { Origin: site } : {}) } })).status, 401);
  }
  const result = await request('/api/auth/logout', { method: 'POST', headers: { Cookie: auth, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(result.status, 200);
  assert.match(result.headers.get('set-cookie'), /__Host-uchiwake_session=;.*Max-Age=0/);
  assert.match(result.headers.get('set-cookie'), /HttpOnly/);
  assert.match(result.headers.get('set-cookie'), /Secure/);
});
test('OAuth start binds state, nonce and PKCE to a short-lived secure cookie', async () => {
  const first = await request('/api/auth/google');
  assert.equal(first.status, 303);
  const target = new URL(first.headers.get('location'));
  assert.equal(target.origin, 'https://accounts.google.com');
  assert.equal(target.searchParams.get('redirect_uri'), `${origin}/api/auth/google/callback`);
  assert.equal(target.searchParams.get('scope'), 'openid email profile');
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  const cookie = cookieHeader(first);
  const flow = decodeJwt(cookie.split('=')[1]);
  assert.equal(flow.state, target.searchParams.get('state'));
  assert.equal(flow.nonce, target.searchParams.get('nonce'));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(flow.verifier));
  assert.equal(Buffer.from(hash).toString('base64url'), target.searchParams.get('code_challenge'));
  assert.match(first.headers.get('set-cookie'), /Max-Age=600/);
  assert.match(first.headers.get('set-cookie'), /SameSite=Lax/);
  assert.notEqual(new URL((await request('/api/auth/google')).headers.get('location')).searchParams.get('state'), flow.state);
});
test('callback rejects missing, mismatched, expired state and handles cancelled consent without calling Google', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('Invalid state must never reach Google');
  try {
    const start = await request('/api/auth/google');
    const cookie = cookieHeader(start), flow = decodeJwt(cookie.split('=')[1]);
    for (const options of [{}, { headers: { Cookie: cookie } }]) {
      const result = await request('/api/auth/google/callback?state=wrong&code=code', options);
      assert.equal(result.headers.get('location'), '/?auth_error=expired');
    }
    const expired = await new SignJWT({ ...flow, exp: Math.floor(Date.now()/1000)-1 }).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(env.SESSION_SECRET));
    assert.equal((await request(`/api/auth/google/callback?state=${flow.state}&code=code`, { headers: { Cookie: `__Host-uchiwake_oauth=${expired}` } })).headers.get('location'), '/?auth_error=expired');
    const cancelled = await request(`/api/auth/google/callback?state=${flow.state}&error=access_denied`, { headers: { Cookie: cookie } });
    assert.equal(cancelled.headers.get('location'), '/?auth_error=cancelled');
    assert.match(cancelled.headers.get('set-cookie'), /Max-Age=0/);
  } finally { globalThis.fetch = originalFetch; }
});
test('Google callback verifies signature, issuer, audience, expiry, nonce, verified email and household access before creating a session', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'google-test-key', alg: 'RS256', use: 'sig' };
  const originalFetch = globalThis.fetch;
  try {
    for (const [override, expected] of [
      [{}, '/'], [{ email: 'outsider@example.test' }, '/?auth_error=not_allowed'],
      [{ nonce: 'wrong' }, '/?auth_error=failed'], [{ email_verified: false }, '/?auth_error=failed'],
      [{ iss: 'https://attacker.test' }, '/?auth_error=failed'], [{ aud: 'other-client' }, '/?auth_error=failed'],
      [{ exp: 1 }, '/?auth_error=failed'], [{ azp: 'other-client' }, '/?auth_error=failed'],
      [{ nonce: null }, '/?auth_error=failed'], [{ corruptSignature: true }, '/?auth_error=failed'],
    ]) {
      const start = await request('/api/auth/google'), cookie = cookieHeader(start), flow = decodeJwt(cookie.split('=')[1]);
      const idToken = await new SignJWT({ sub: 'real-google-sub', email: 'member@example.test', email_verified: true, name: 'Member', nonce: flow.nonce, iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now()/1000)+300, ...override }).setIssuedAt().setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(privateKey);
      globalThis.fetch = async (url, options) => {
        if (String(url) === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
        assert.equal(String(url), 'https://oauth2.googleapis.com/token');
        const body = new URLSearchParams(options.body);
        assert.equal(body.get('code_verifier'), flow.verifier);
        assert.equal(body.get('client_secret'), env.GOOGLE_CLIENT_SECRET);
        return Response.json({ id_token: override.corruptSignature ? idToken.slice(0, -12) + 'AAAAAAAAAAAA' : idToken });
      };
      const result = await request(`/api/auth/google/callback?state=${flow.state}&code=test-code`, { headers: { Cookie: cookie } });
      assert.equal(result.headers.get('location'), expected);
      const session = result.headers.getSetCookie().find(value => value.startsWith('__Host-uchiwake_session='));
      if (expected === '/') {
        assert.ok(session);
        const me = await request('/api/auth/session', { headers: { Cookie: session.split(';')[0] } });
        assert.equal((await me.json()).user.id, 'real-google-sub');
        assert.ok(!session.includes(idToken));
      } else assert.equal(session, undefined);
    }
  } finally { globalThis.fetch = originalFetch; }
});
