import { completeGitHubConnection } from '@/lib/github-connection';
import { clearSessionCookie } from '@/lib/firebase-session';
import { isTrustedMutationOrigin, jsonError, noStoreHeaders } from '@/lib/platform-policy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ all?: string[] }> };
export async function GET(request: Request, context: Context) {
  const path = ((await context.params).all ?? []).join('/');
  if (path === 'callback/github') return completeGitHubConnection(request);
  return jsonError('Use Firebase sign-in at /login.', 410);
}
export async function POST(request: Request, context: Context) {
  const path = ((await context.params).all ?? []).join('/');
  if (path !== 'sign-out') return jsonError('Use Firebase sign-in at /login.', 410);
  if (!isTrustedMutationOrigin(request)) return jsonError('Invalid request origin.', 403);
  const headers = noStoreHeaders(); headers.append('Set-Cookie', clearSessionCookie());
  return Response.json({ ok: true }, { headers });
}
