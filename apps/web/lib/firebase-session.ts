import 'server-only';
import { randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { and, eq } from 'drizzle-orm';
import config from '../../../firebase-applet-config.json';
import { getPlatformDb } from './db/client';
import { account, user } from './db/schema';
import { PlatformAuthenticationError, PlatformSetupRequiredError } from './platform-policy';

export const FIREBASE_SESSION_COOKIE = '__Host-aisdk-session';
const SESSION_SECONDS = 3 * 60 * 60;
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

export function sessionKey() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim() ?? '';
  if (Buffer.byteLength(secret) < 32) throw new PlatformSetupRequiredError('Session secret is not configured.');
  return new TextEncoder().encode(secret);
}
export function readCookie(request: Request, name: string) {
  return (request.headers.get('cookie') ?? '').split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1);
}
export async function readFirebaseSession(request: Request) {
  const token = readCookie(request, FIREBASE_SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), {
      algorithms: ['HS256'], issuer: 'aisdkpro-session', audience: config.projectId,
    });
    if (typeof payload.sub !== 'string' || typeof payload.firebaseUid !== 'string' ||
        typeof payload.email !== 'string' || payload.emailVerified !== true) return null;
    return payload;
  } catch { return null; }
}
export async function sessionCookie(claims: JWTPayload) {
  const token = await new SignJWT({ firebaseUid: claims.firebaseUid, email: claims.email,
    name: claims.name, image: claims.image ?? null, emailVerified: true })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(claims.sub!)
    .setIssuer('aisdkpro-session').setAudience(config.projectId)
    .setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(sessionKey());
  return `${FIREBASE_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}
export function clearSessionCookie() {
  return `${FIREBASE_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
export async function firebaseSessionUser(request: Request) {
  const claims = await readFirebaseSession(request);
  if (!claims) return null;
  return { id: claims.sub!, name: typeof claims.name === 'string' ? claims.name : '',
    email: claims.email as string, emailVerified: true,
    image: typeof claims.image === 'string' ? claims.image : null };
}
export async function exchangeFirebaseIdentity(idToken: string, request: Request, legacyUserId?: string) {
  const { payload } = await jwtVerify(idToken, keys, {
    algorithms: ['RS256'], issuer: `https://securetoken.google.com/${config.projectId}`,
    audience: config.projectId, maxTokenAge: '65m',
  });
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || payload.sub.length > 128 || typeof payload.email !== 'string' ||
      payload.email_verified !== true || typeof payload.auth_time !== 'number' || payload.auth_time > now)
    throw new PlatformAuthenticationError('Verify your Firebase email before signing in.');
  const current = await readFirebaseSession(request);
  if (now - payload.auth_time > SESSION_SECONDS && current?.firebaseUid !== payload.sub)
    throw new PlatformAuthenticationError('Sign in again to start a new session.');
  const db = getPlatformDb();
  if (!db) throw new PlatformSetupRequiredError('Workspace database is not configured.');
  const mapped = await db.select({ userId: account.userId }).from(account).where(and(
    eq(account.providerId, 'firebase'), eq(account.accountId, payload.sub))).limit(1);
  let id = mapped[0]?.userId;
  if (!id) {
    const existing = await db.select().from(user).where(eq(user.email, payload.email.toLowerCase())).limit(1);
    // Existing accounts are linked explicitly using their active session, never
    // silently merged because two independent identities have the same email.
    if (existing[0] && current?.sub !== existing[0].id && legacyUserId !== existing[0].id)
      throw new PlatformAuthenticationError('Sign in to the existing workspace before linking this Firebase account.');
    id = existing[0]?.id ?? randomUUID();
    const mapping = db.insert(account).values({ id: randomUUID(), userId: id,
      providerId: 'firebase', accountId: payload.sub, createdAt: new Date(), updatedAt: new Date() });
    try {
      if (existing[0]) await mapping;
      else await db.batch([
        db.insert(user).values({ id, email: payload.email.toLowerCase(),
          name: typeof payload.name === 'string' ? payload.name : payload.email,
          image: typeof payload.picture === 'string' ? payload.picture : null,
          emailVerified: true, createdAt: new Date(), updatedAt: new Date() }),
        mapping,
      ]);
    } catch (error) {
      // Concurrent tabs can exchange the same Firebase identity at once.
      const [concurrent] = await db.select({ userId: account.userId }).from(account).where(and(
        eq(account.providerId, 'firebase'), eq(account.accountId, payload.sub))).limit(1);
      if (!concurrent) throw error;
      id = concurrent.userId;
    }
  }
  return { sub: id, firebaseUid: payload.sub, email: payload.email,
    name: typeof payload.name === 'string' ? payload.name : payload.email,
    image: typeof payload.picture === 'string' ? payload.picture : null, emailVerified: true };
}
