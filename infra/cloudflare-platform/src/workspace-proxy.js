// One browser origin and one Better Auth session. Deployment jobs stay on the
// Worker; application pages and browser APIs are served by the existing VPS.
function httpsOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid workspace origin.');
  return url.origin;
}

export async function workspaceProxy(request, env, upstreamFetch = fetch) {
  const url = new URL(request.url);
  if (!env.WORKSPACE_ORIGIN || url.origin !== httpsOrigin(env.WORKSPACE_ORIGIN)) return null;
  // Keep signed server-to-server operations, GitHub webhooks and Worker health
  // on this Worker, including when the app uses this hostname for its bridge.
  if (['/internal/workspace', '/api/github/webhook', '/health'].includes(url.pathname)) return null;
  if (!env.WORKSPACE_WEB_ORIGIN) return new Response('Workspace is temporarily unavailable.', {
    status: 503, headers: { 'Cache-Control': 'no-store' },
  });
  const origin = httpsOrigin(env.WORKSPACE_WEB_ORIGIN);
  if (origin === url.origin) throw new Error('Workspace origin would loop.');
  // The old standalone dashboard OAuth session is deliberately not reused.
  // Never forward a legacy OAuth code/state to a different callback handler.
  if (url.pathname.startsWith('/auth/')) return new Response(null, {
    status: 303, headers: { Location: `${url.origin}/login`, 'Cache-Control': 'no-store' },
  });
  const target = new URL(origin);
  // Assign the path instead of resolving it: a path beginning // must never
  // turn into a network-path reference to a user-controlled host.
  target.pathname = url.pathname;
  target.search = url.search;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('forwarded');
  headers.set('X-Forwarded-Host', url.host);
  headers.set('X-Forwarded-Proto', 'https');
  headers.set('X-Forwarded-Port', '443');
  // The VPS does not receive deployment bridge credentials.
  headers.delete('x-aisdk-signature');
  headers.delete('x-aisdk-timestamp');
  let response;
  try {
    response = await upstreamFetch(new Request(target, {
      method: request.method, headers, body: request.body,
      redirect: 'manual', signal: request.signal,
      ...(request.body ? { duplex: 'half' } : {}),
    }), { cf: { cacheEverything: false, cacheTtl: 0 } });
  } catch {
    return new Response('Workspace is temporarily unavailable. Please try again.', {
      status: 502, headers: { 'Cache-Control': 'no-store' },
    });
  }
  const outgoing = new Headers(response.headers);
  const location = outgoing.get('location');
  if (location) {
    const destination = new URL(location, target);
    if (destination.origin === origin) {
      outgoing.set('location', url.origin + destination.pathname + destination.search + destination.hash);
    }
  }
  // Never cache session responses or authenticated application data at the edge.
  if (url.pathname.startsWith('/api/') || request.headers.has('cookie') || outgoing.has('set-cookie')) {
    outgoing.set('Cache-Control', 'private, no-store');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outgoing });
}
