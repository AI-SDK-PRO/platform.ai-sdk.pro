import { getAuth } from "@/lib/auth";
import { clearSessionCookie, exchangeFirebaseIdentity, sessionCookie } from '@/lib/firebase-session';
import { isTrustedMutationOrigin, jsonError, noStoreHeaders, safePlatformError } from '@/lib/platform-policy';
import { readLimitedBody } from '@/lib/request-limits';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!isTrustedMutationOrigin(request)) return jsonError('Origin is not allowed.', 403);
  try {
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(await readLimitedBody(request, AbortSignal.timeout(5000), 16384));
    } catch {
      return jsonError('Invalid sign-in request.', 400);
    }
    const body = parsedBody as { idToken?: unknown };
    if (typeof body?.idToken !== 'string' || body.idToken.length > 12000) return jsonError('Invalid sign-in request.', 400);
    // Preserve ownership only when the browser proves an existing signed session.
    let legacyUserId: string | undefined;
    try {
      const legacy = await getAuth().api.getSession({ headers: request.headers });
      if (legacy?.user?.emailVerified) legacyUserId = legacy.user.id;
    } catch { /* Fresh Firebase accounts do not require a legacy session. */ }
    const claims = await exchangeFirebaseIdentity(body.idToken, request, legacyUserId);
    const headers = noStoreHeaders(); headers.append('Set-Cookie', await sessionCookie(claims, request));
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const safe = safePlatformError(error);
    return jsonError(safe.status === 500 ? 'Sign-in could not be completed. Check the account setup.' : safe.message, safe.status);
  }
}
export async function DELETE(request: Request) {
  if (!isTrustedMutationOrigin(request)) return jsonError('Origin is not allowed.', 403);
  const headers = noStoreHeaders(); headers.append('Set-Cookie', clearSessionCookie(request));
  return Response.json({ ok: true }, { headers });
}
