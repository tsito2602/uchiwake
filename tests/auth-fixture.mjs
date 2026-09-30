import { SignJWT } from 'jose';
export const authEnv = { GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-client-secret', SESSION_SECRET: 'test-session-secret-at-least-32-bytes-long', ALLOWED_EMAILS: 'member@example.test' };
export async function sessionCookie(overrides = {}, env = authEnv) {
  const token = await new SignJWT({ sub: 'google-test-id', email: 'member@example.test', name: 'Test Member', purpose: 'session', ...overrides })
    .setProtectedHeader({ alg: 'HS256' }).setIssuer('uchiwake').setAudience('https://example.test').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(env.SESSION_SECRET));
  return `__Host-uchiwake_session=${token}`;
}
export const auth = await sessionCookie();
