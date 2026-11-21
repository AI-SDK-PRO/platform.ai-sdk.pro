import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { and, eq } from 'drizzle-orm';
import { account } from './db/schema';
import { getPlatformDb } from './db/client';
import { firebaseSessionUser, readCookie, sessionKey } from './firebase-session';
import { getPlatformConfig, noStoreHeaders, PlatformAuthenticationError, PlatformSetupRequiredError, resolvePublicOrigin } from './platform-policy';

const COOKIE = '__Host-aisdk-github-link';
const PROVIDER = 'github-firebase';
function tokenKey() { return createHash('sha256').update(sessionKey()).update('github-connection-v1').digest(); }
function seal(token: string, owner: string, githubId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv);
  cipher.setAAD(Buffer.from(`${owner}:${githubId}`));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['fb1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}
function open(token: string, owner: string, githubId: string) {
  const [version, iv, tag, data] = token.split('.');
  if (version !== 'fb1' || !iv || !tag || !data) throw new Error('Invalid stored connection.');
  const cipher = createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(iv, 'base64url'));
  cipher.setAAD(Buffer.from(`${owner}:${githubId}`));
  cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString('utf8');
}
export async function readConnectedGitHubToken(userId: string) {
  const db = getPlatformDb();
  if (!db) throw new PlatformSetupRequiredError('Workspace storage is unavailable.');
  const [row] = await db.select().from(account).where(and(eq(account.userId, userId), eq(account.providerId, PROVIDER))).limit(1);
  if (!row?.accessToken || (row.accessTokenExpiresAt && row.accessTokenExpiresAt <= new Date())) return null;
  return open(row.accessToken, userId, row.accountId);
}
export async function beginGitHubConnection(request: Request) {
  const user = await firebaseSessionUser(request);
  if (!user) throw new PlatformAuthenticationError();
  const config = getPlatformConfig();
  if (!config.githubClientId || !config.githubClientSecret) throw new PlatformSetupRequiredError('GitHub connection is not configured.');
  const publicOrigin = resolvePublicOrigin(request, config);
  const state = randomBytes(32).toString('base64url');
  const signed = await new SignJWT({ state }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id).setIssuer('aisdkpro-github-link').setAudience(publicOrigin)
    .setIssuedAt().setExpirationTime('10m').sign(sessionKey());
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.githubClientId);
  url.searchParams.set('redirect_uri', new URL('/api/auth/callback/github', publicOrigin).toString());
  url.searchParams.set('scope', 'read:user user:email');
  url.searchParams.set('state', state);
  const headers = noStoreHeaders();
  headers.set('Location', url.toString());
  headers.append('Set-Cookie', `${COOKIE}=${signed}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`);
  return new Response(null, { status: 303, headers });
}
export async function completeGitHubConnection(request: Request) {
  const config = getPlatformConfig();
  const publicOrigin = resolvePublicOrigin(request, config);
  const headers = noStoreHeaders();
  headers.append('Set-Cookie', `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
  headers.set('Referrer-Policy', 'no-referrer');
  try {
    const user = await firebaseSessionUser(request);
    const signed = readCookie(request, COOKIE);
    if (!user || !signed) throw new Error('Missing link session.');
    const { payload } = await jwtVerify(signed, sessionKey(), { algorithms: ['HS256'], issuer: 'aisdkpro-github-link', audience: publicOrigin });
    const url = new URL(request.url);
    if (payload.sub !== user.id || typeof payload.state !== 'string' || url.searchParams.get('state') !== payload.state || url.searchParams.has('error'))
      throw new Error('Invalid link state.');
    const code = url.searchParams.get('code');
    if (!code || code.length > 1024) throw new Error('Invalid code.');
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: config.githubClientId, client_secret: config.githubClientSecret, code,
        redirect_uri: new URL('/api/auth/callback/github', publicOrigin).toString() }), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json() as { access_token?: string; expires_in?: number; scope?: string };
    if (!response.ok || !data.access_token) throw new Error('GitHub authorization failed.');
    const profile = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${data.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15000) });
    const identity = await profile.json() as { id?: number };
    if (!profile.ok || !Number.isSafeInteger(identity.id)) throw new Error('Invalid GitHub identity.');
    const githubId = String(identity.id);
    const db = getPlatformDb();
    if (!db) throw new Error('Storage unavailable.');
    const [existing] = await db.select().from(account).where(and(eq(account.providerId, PROVIDER), eq(account.accountId, githubId))).limit(1);
    if (existing && existing.userId !== user.id) throw new Error('GitHub is already connected to another workspace.');
    const values = { accessToken: seal(data.access_token, user.id, githubId),
      accessTokenExpiresAt: typeof data.expires_in === 'number' ? new Date(Date.now() + data.expires_in * 1000) : null,
      scope: data.scope ?? '', updatedAt: new Date() };
    if (existing) await db.update(account).set(values).where(and(eq(account.id, existing.id), eq(account.userId, user.id)));
    else await db.insert(account).values({ id: randomUUID(), userId: user.id, providerId: PROVIDER, accountId: githubId, createdAt: new Date(), ...values });
    headers.set('Location', new URL('/workspace/account?linked=1', publicOrigin).toString());
  } catch {
    headers.set('Location', new URL('/workspace/account?error=github', publicOrigin).toString());
  }
  return new Response(null, { status: 303, headers });
}
