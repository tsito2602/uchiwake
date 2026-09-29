import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { googleAvatar, profileFor, saveDisplayName, saveProviderProfile } from './profile';

export type AuthBindings = {
  DB?: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  ALLOWED_EMAILS?: string;
};
export type AuthUser = { id: string; email: string; name: string; avatarUrl?: string };
type AuthEnv = { Bindings: AuthBindings };
const SESSION_COOKIE = '__Host-uchiwake_session';
const FLOW_COOKIE = '__Host-uchiwake_oauth';
const SESSION_SECONDS = 86400;
const FLOW_SECONDS = 600;
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'Lax' as const, path: '/' };
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const encoder = new TextEncoder();
const allowedEmails = (env: AuthBindings) => (env.ALLOWED_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
export const authConfigured = (env: AuthBindings) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET && encoder.encode(env.SESSION_SECRET).length >= 32 && allowedEmails(env).length);
const allowed = (email: string, env: AuthBindings) => allowedEmails(env).includes(email.toLowerCase());
const random = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const key = (env: AuthBindings) => encoder.encode(env.SESSION_SECRET!);
const providerName = (value:unknown) => typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,100):'';
async function token(payload: JWTPayload, env: AuthBindings, origin: string, purpose: string, seconds: number) {
  return new SignJWT({ ...payload, purpose }).setProtectedHeader({ alg: 'HS256' }).setIssuer('uchiwake').setAudience(origin).setIssuedAt().setExpirationTime(`${seconds}s`).sign(key(env));
}
async function verify(value: string, env: AuthBindings, origin: string, purpose: string) {
  const { payload } = await jwtVerify(value, key(env), { algorithms: ['HS256'], issuer: 'uchiwake', audience: origin, requiredClaims: ['exp', 'iat'] });
  if (payload.purpose !== purpose) throw new Error('Invalid token purpose');
  return payload;
}
export async function sessionUser<E extends AuthEnv>(c: Context<E>): Promise<AuthUser | null> {
  if (!authConfigured(c.env)) return null;
  const value = getCookie(c, SESSION_COOKIE);
  if (!value) return null;
  try {
    const payload = await verify(value, c.env, new URL(c.req.url).origin, 'session');
    if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string' || !allowed(payload.email, c.env)) return null;
    return { id: payload.sub, email: payload.email, name: providerName(payload.name), avatarUrl: googleAvatar(payload.picture) };
  } catch { return null; }
}
export const authRoutes = new Hono<AuthEnv>();
authRoutes.get('/session', async c => {
  const user = await sessionUser(c);
  return c.json({ user: user ? await profileFor(c.env.DB, user) : null, configured: authConfigured(c.env) });
});
authRoutes.put('/profile', async c => {
  const user = await sessionUser(c);
  if (!user) return c.json({ error: 'ログインし直してください' }, 401);
  if (!c.env.DB) return c.json({ error: '表示名を保存できませんでした' }, 503);
  const body = await c.req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) return c.json({ error: '表示名は1〜100文字で入力してください' }, 400);
  await saveDisplayName(c.env.DB, user.id, name);
  return c.json({ user: await profileFor(c.env.DB, { ...user, name }) });
});
authRoutes.get('/google', async c => {
  if (!authConfigured(c.env)) return c.redirect('/?auth_error=unavailable', 303);
  const origin = new URL(c.req.url).origin;
  if (!origin.startsWith('https://')) return c.redirect('/?auth_error=unavailable', 303);
  const state = random(), nonce = random(), verifier = random();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const flow = await token({ state, nonce, verifier }, c.env, origin, 'oauth', FLOW_SECONDS);
  setCookie(c, FLOW_COOKIE, flow, { ...cookieOptions, maxAge: FLOW_SECONDS });
  const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  target.search = new URLSearchParams({ client_id: c.env.GOOGLE_CLIENT_ID!, redirect_uri: `${origin}/api/auth/google/callback`, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' }).toString();
  return c.redirect(target.toString(), 303);
});
authRoutes.get('/google/callback', async c => {
  const value = getCookie(c, FLOW_COOKIE);
  deleteCookie(c, FLOW_COOKIE, cookieOptions);
  const fail = (reason: string) => c.redirect(`/?auth_error=${reason}`, 303);
  if (!authConfigured(c.env)) return fail('unavailable');
  const origin = new URL(c.req.url).origin;
  let flow: JWTPayload;
  try {
    if (!value) return fail('expired');
    flow = await verify(value, c.env, origin, 'oauth');
    if (!c.req.query('state') || flow.state !== c.req.query('state') || typeof flow.verifier !== 'string' || typeof flow.nonce !== 'string') return fail('expired');
  } catch { return fail('expired'); }
  if (c.req.query('error')) return fail(c.req.query('error') === 'access_denied' ? 'cancelled' : 'failed');
  const code = c.req.query('code');
  if (!code) return fail('failed');
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: c.env.GOOGLE_CLIENT_ID!, client_secret: c.env.GOOGLE_CLIENT_SECRET!, redirect_uri: `${origin}/api/auth/google/callback`, grant_type: 'authorization_code', code_verifier: flow.verifier as string }),
    });
    if (!response.ok) return fail('failed');
    const result = await response.json() as { id_token?: string };
    if (!result.id_token) return fail('failed');
    const { payload } = await jwtVerify(result.id_token, googleKeys, { algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: c.env.GOOGLE_CLIENT_ID!, requiredClaims: ['exp', 'iat', 'sub'] });
    if (payload.nonce !== flow.nonce || (payload.azp !== undefined && payload.azp !== c.env.GOOGLE_CLIENT_ID) || !payload.sub || payload.email_verified !== true || typeof payload.email !== 'string') return fail('failed');
    if (!allowed(payload.email, c.env)) return fail('not_allowed');
    const picture = googleAvatar(payload.picture);
    const name = providerName(payload.name);
    await saveProviderProfile(c.env.DB, payload.sub, name, picture);
    const session = await token({ sub: payload.sub, email: payload.email, name, ...(picture ? { picture } : {}) }, c.env, origin, 'session', SESSION_SECONDS);
    setCookie(c, SESSION_COOKIE, session, { ...cookieOptions, maxAge: SESSION_SECONDS });
    return c.redirect('/', 303);
  } catch {
    // Never log authorization codes, Google tokens, or callback query strings.
    console.error(JSON.stringify({ event: 'google_login_failed' }));
    return fail('failed');
  }
});
authRoutes.post('/logout', c => {
  deleteCookie(c, SESSION_COOKIE, cookieOptions);
  deleteCookie(c, FLOW_COOKIE, cookieOptions);
  return c.json({ ok: true });
});
