import { readFirebaseSession, firebaseSessionUser, sessionCookie } from '@/lib/firebase-session';
import { isTrustedMutationOrigin, jsonError, noStoreHeaders } from '@/lib/platform-policy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function respond(request: Request, renew: boolean) {
  if (renew && !isTrustedMutationOrigin(request)) return jsonError('Origin is not allowed.', 403);
  const claims = await readFirebaseSession(request);
  const user = await firebaseSessionUser(request);
  const headers = noStoreHeaders();
  if (renew && claims) headers.append('Set-Cookie', await sessionCookie(claims));
  return Response.json({ user, expiresAt: claims ? new Date((renew ? Date.now() / 1000 + 10800 : Number(claims.exp)) * 1000).toISOString() : null }, { headers });
}
export const GET = (request: Request) => respond(request, false);
export const POST = (request: Request) => respond(request, true);
