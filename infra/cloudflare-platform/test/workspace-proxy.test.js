import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceProxy } from '../src/workspace-proxy.js';

const env = { WORKSPACE_ORIGIN: 'https://platform.ai-sdk.pro', WORKSPACE_WEB_ORIGIN: 'https://staging.ai-sdk.pro' };
const neverFetch = () => assert.fail('Unexpected upstream request');

test('deployment bridge, webhook, health and operator host remain on the Worker', async () => {
  for (const path of ['/internal/workspace', '/api/github/webhook', '/health']) {
    assert.equal(await workspaceProxy(new Request(env.WORKSPACE_ORIGIN + path), env, neverFetch), null);
  }
  assert.equal(await workspaceProxy(new Request('https://deploy-staging.ai-sdk.pro/'), env, neverFetch), null);
  assert.equal(await workspaceProxy(new Request(env.WORKSPACE_ORIGIN), {}, neverFetch), null);
});

test('login POST preserves browser origin/body and session cookies without following redirects', async () => {
  const request = new Request(env.WORKSPACE_ORIGIN + '/api/auth/sign-in/email', {
    method: 'POST', body: JSON.stringify({ email: 'test@example.com', password: 'synthetic-test-password' }),
    headers: { Origin: env.WORKSPACE_ORIGIN, Cookie: 'session=synthetic',
      'Content-Type': 'application/json', 'X-Forwarded-Host': 'attacker.example',
      Forwarded: 'host=attacker.example', 'X-AISDK-Signature': 'must-not-forward' },
  });
  const response = await workspaceProxy(request, env, async (upstream) => {
    assert.equal(upstream.url, env.WORKSPACE_WEB_ORIGIN + '/api/auth/sign-in/email');
    assert.equal(upstream.headers.get('origin'), env.WORKSPACE_ORIGIN);
    assert.equal(upstream.headers.get('x-forwarded-host'), 'platform.ai-sdk.pro');
    assert.equal(upstream.headers.get('forwarded'), null);
    assert.equal(upstream.headers.get('x-aisdk-signature'), null);
    assert.equal(upstream.headers.get('cookie'), 'session=synthetic');
    assert.equal(upstream.redirect, 'manual');
    assert.equal((await upstream.json()).email, 'test@example.com');
    const headers = new Headers();
    headers.append('Set-Cookie', '__Host-session=one; HttpOnly; Secure; Path=/');
    headers.append('Set-Cookie', '__Host-state=two; HttpOnly; Secure; Path=/');
    return new Response('{}', { headers });
  });
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('OAuth callback reaches Better Auth and external GitHub redirects remain intact', async () => {
  const response = await workspaceProxy(new Request(env.WORKSPACE_ORIGIN + '/api/auth/callback/github?code=synthetic&state=fixture'), env, async request => {
    assert.equal(new URL(request.url).pathname, '/api/auth/callback/github');
    assert.equal(new URL(request.url).searchParams.get('state'), 'fixture');
    return new Response(null, { status: 302, headers: { Location: 'https://github.com/login/oauth/authorize?state=fixture' } });
  });
  assert.equal(response.headers.get('location'), 'https://github.com/login/oauth/authorize?state=fixture');
});

test('upstream app redirects stay on the public origin; old OAuth codes are not forwarded', async () => {
  const response = await workspaceProxy(new Request(env.WORKSPACE_ORIGIN + '/workspace'), env, async () =>
    new Response(null, { status: 307, headers: { Location: env.WORKSPACE_WEB_ORIGIN + '/login?expired=1' } }));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), env.WORKSPACE_ORIGIN + '/login?expired=1');
  const legacy = await workspaceProxy(new Request(env.WORKSPACE_ORIGIN + '/auth/github/callback?code=private'), env, neverFetch);
  assert.equal(legacy.status, 303);
  assert.equal(legacy.headers.get('location'), env.WORKSPACE_ORIGIN + '/login');
});

test('chat response streams without buffering and cancellation propagates', async () => {
  const controller = new AbortController();
  const stream = new ReadableStream({ start(output) { output.enqueue(new TextEncoder().encode('data: hello\n\n')); output.close(); } });
  let upstreamSignal;
  const response = await workspaceProxy(new Request(env.WORKSPACE_ORIGIN + '/api/chat', { signal: controller.signal }), env, async request => {
    upstreamSignal = request.signal;
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  });
  assert.equal(response.body, stream);
  assert.equal(await response.text(), 'data: hello\n\n');
  controller.abort();
  assert.equal(upstreamSignal.aborted, true);
});

test('missing, insecure and recursive origins fail without reaching upstream', async () => {
  const request = new Request(env.WORKSPACE_ORIGIN);
  assert.equal((await workspaceProxy(request, { ...env, WORKSPACE_WEB_ORIGIN: '' }, neverFetch)).status, 503);
  for (const origin of [env.WORKSPACE_ORIGIN, 'http://staging.ai-sdk.pro', 'https://u:p@staging.ai-sdk.pro', 'https://staging.ai-sdk.pro/path']) {
    await assert.rejects(workspaceProxy(request, { ...env, WORKSPACE_WEB_ORIGIN: origin }, neverFetch));
  }
  const response = await workspaceProxy(request, env, async () => { throw new Error('private-upstream-details'); });
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private-upstream-details/);
});

test('network-path request targets cannot change the configured upstream', async () => {
  await workspaceProxy(new Request(env.WORKSPACE_ORIGIN + '//attacker.example/steal'), env, async request => {
    assert.equal(new URL(request.url).origin, env.WORKSPACE_WEB_ORIGIN);
    assert.equal(new URL(request.url).pathname, '//attacker.example/steal');
    return new Response('ok');
  });
});
