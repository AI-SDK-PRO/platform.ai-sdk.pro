import { beginGitHubConnection } from '@/lib/github-connection';
import { getPlatformConfig, jsonError, safePlatformError } from '@/lib/platform-policy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return jsonError('Invalid request origin.', 403);
  try { return await beginGitHubConnection(request); }
  catch (error) { const safe = safePlatformError(error); return jsonError(safe.message, safe.status); }
}
