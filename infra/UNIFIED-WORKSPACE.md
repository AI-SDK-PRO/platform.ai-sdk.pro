# Unified workspace — prepared 2026-11-18 (Asia/Bangkok)

Source: `z-ey3eiei/platform.ai-sdk.pro`, based on `098f6a6`.
Owner approved pushing and deploying this change in the current session.
Source is being uploaded to `fix/unified-platform-origin`; production activation
requires the new VPS image, runtime configuration and Worker release.
This document does not claim a successful live deployment.

## Public journey

`platform.ai-sdk.pro` is the canonical application origin. The Cloudflare
Platform API Worker proxies pages, assets and browser APIs to the existing
VPS application. Better Auth on that application owns authentication; no
standalone Worker dashboard session is used on the public workspace hostname.

| Request | Handler |
| --- | --- |
| `/login`, `/signup`, `/workspace/*`, `/chat`, static assets | VPS Next.js app |
| `/api/auth/*`, `/api/platform/*`, other browser APIs | VPS Next.js app |
| `/internal/workspace` | Existing signed Cloudflare deployment bridge |
| `/api/github/webhook` | Existing signature-verified Cloudflare webhook |
| `/health` | Worker/D1 diagnostic |
| `/auth/*` on the workspace hostname | Restart sign-in at `/login` |

The Worker forwards cookie headers and response cookies, preserves stream
bodies and client cancellation, and handles redirects manually. It rewrites
only redirects to the configured VPS origin back to the public workspace.
External OAuth redirects remain unchanged. The upstream is fixed by operator
configuration; request paths and forwarded headers cannot select another host.

The operator dashboard on `deploy-staging.ai-sdk.pro` remains separate.
Project dispatch routes are unchanged. No wildcard DNS changes are included.

## Existing infrastructure observed

The signed-in Coolify application `ai-sdk-pro-web-staging` is running on
`server.ai-sdk.pro`; its Domains page lists `https://staging.ai-sdk.pro` with
DNS matching and internal port 3000. This is the configured upstream for the
prepared Worker. The Coolify image is still
`ghcr.io/z-ey3eiei/ai-sdk-pro-web:coolify-staging` from the older project.
The image must be replaced by a build of this source before switching traffic.
The domain observation does not establish that this source is already running.

## Activation order after owner approval

1. Build this repository with its npm lockfile. The old Dockerfile required
   a missing pnpm lockfile; it now uses `npm ci` and builds SDK, CLI and web.
   Verify the new image privately before changing Coolify's running image.
2. Configure the VPS runtime with existing secrets (do not regenerate shared
   secrets). Required public values:

   ```dotenv
   BETTER_AUTH_URL=https://platform.ai-sdk.pro
   APP_ORIGINS=https://platform.ai-sdk.pro,https://staging.ai-sdk.pro,https://ai-sdk.pro
   PLATFORM_DEPLOY_ORIGIN=https://platform.ai-sdk.pro
   ```

   Keep `NEON_DATABASE_URL`, `BETTER_AUTH_SECRET`, GitHub credentials and the
   paired `PLATFORM_BRIDGE_SECRET` in the runtime secret store. Compose reads
   these from `/opt/ai-sdk-pro/config/app.env` without empty-value overrides.
   For email signup, verify Resend and set the existing email enable flag.
   Database migration state must be checked before applying migrations.
3. Verify the existing GitHub App has callback
   `https://platform.ai-sdk.pro/api/auth/callback/github`. Do not use the old
   standalone Worker callback `/auth/github/callback` for Better Auth.
4. Deploy the Platform API Worker with the prepared origin pair:

   ```dotenv
   WORKSPACE_ORIGIN=https://platform.ai-sdk.pro
   WORKSPACE_WEB_ORIGIN=https://staging.ai-sdk.pro
   ```

5. Confirm the bridge secret matches at both ends, then enable
   `PLATFORM_BRIDGE_ENABLED` only after a private signed bridge smoke test.
   Keep the existing routing/public-deploy/build gates unchanged until their
   live prerequisites have been verified. This patch does not enable them.
6. Live acceptance: public pages load without login; sign-in returns to the
   workspace on the same hostname; logout clears that session; email
   verification (if enabled), repository import, deployment status/history,
   chat streaming and an authorized pilot deployment work without a second
   login. Test an unowned project is denied before public rollout.

## Rollback

Restore the prior Worker version and the prior Coolify image/configuration.
This patch does not alter Neon/D1 schema, project routes, stored credentials,
or existing deployments. Existing legacy Worker sessions do not become
Better Auth sessions; users entering through that old flow sign in once again.

## Validation completed locally

- Web/SDK/CLI tests: 23 files, 110 tests passed.
- Cloudflare platform tests: 17 tests passed, including 7 new proxy tests.
- All four workspace typechecks passed; SDK/CLI and Next.js production builds passed.
- Platform API and dispatch Worker Wrangler dry-runs passed; nothing was deployed.
- Production HTTP smoke through the proxy passed for `/`, `/login`, `/signup`,
  `/workspace`, `/workspace/deploy`, `/chat`, `/api/health`, `/api/platform/status`
  and the `/deploy` redirect. This used a local server adapter and no real secrets.
- `git diff --check` passed. Docker itself is unavailable in this environment,
  so no container image build or live OAuth/email/deployment acceptance is claimed.

## Reference

- https://developers.cloudflare.com/workers/runtime-apis/request/
- https://better-auth.com/docs/reference/security
- https://better-auth.com/docs/reference/options

## Firebase authentication

Firebase project `gen-lang-client-0257543355` owns user sign-in. The browser exchanges a verified Firebase ID token for a host-only HttpOnly workspace session on VPS (three-hour idle lifetime). `BETTER_AUTH_SECRET` remains the VPS signing/encryption secret; it must be at least 32 bytes and must not be exposed to browser code. No Firebase service-account private key is needed for public-key token verification.

Google is the primary enabled provider. Optional email/password UI is available only when `NEXT_PUBLIC_FIREBASE_EMAIL_AUTH_ENABLED=true` at build time and the Firebase provider is enabled. Firestore keeps the existing per-Firebase-UID private documents and presets. Neon retains project/deployment ownership through an explicit Firebase UID mapping. Existing email matches are never merged without a valid prior workspace session; legacy users without that session need an ownership-verified migration.

GitHub connects from Account Settings to the already authenticated user. The existing VPS `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` authorize repository access; the callback is `https://platform.ai-sdk.pro/api/auth/callback/github`. GitHub is not a second login provider. OAuth tokens are encrypted at rest and bound to the workspace owner. Expired tokens require reconnection.

Before public Firebase sign-in, add `platform.ai-sdk.pro` to Firebase Authentication authorized domains. Add other hostnames only if they will directly offer login. Remaining Worker deployment/agent secrets can be supplied in Cloudflare after the deployment; their absence is a setup condition, not evidence the pipeline is ready.

The production build completed with npm run build. No test suite was run for these Firebase changes, as requested. Deployment activation and production login are not yet claimed.

Source upload is incomplete: GitHub integration returned 403 Resource not accessible by integration for this new repository. Browser uploads committed the library and UI changes (3d94d98 and b2305e2), but subsequent uploads were rejected by browser URL policy. Do not deploy that partial remote branch. The complete local source and source archive contain the remaining routes, lockfile and deployment configuration. Grant the GitHub connection access to z-ey3eiei/platform.ai-sdk.pro before continuing the push.
