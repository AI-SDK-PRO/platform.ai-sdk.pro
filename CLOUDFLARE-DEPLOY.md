# Cloudflare Workers deployment — platform.ai-sdk.pro

This repository is an **npm/Bun monorepo**, not a static site. Deploy the `apps/web` Next.js 16 application with the OpenNext Cloudflare adapter. This keeps the existing Next.js routes, UI, Firebase client and Neon-backed APIs instead of replacing them with a static shell.

## Important boundaries

- No VPS, Docker, Coolify, SSH, GHCR or Vercel runtime is required for the web app.
- This setup uses a **separate Worker** named `platform-ai-sdk-pro-web`. Do not overwrite `platform-ai-sdk-pro`, `platform-ai-sdkpro`, the dispatch workers, or the custom-domain routing before a successful smoke test.
- The Cloudflare Worker runs the **main web** at `apps/web`. `apps/docs` is a separate Next.js site and is **not** automatically bundled into this worker. The web app's own `/docs` routes still exist.
- The existing BYOK mode must not fall back to an owner API key. Set `BLOB_UPLOADS_ENABLED=false` unless/until the private Blob API is migrated from Vercel Blob to R2 and tested.
- Do not commit credentials or `.env` files.

## Install and test

Use Node.js 22 and Bun 1.4.4 or a compatible version. The root already contains multiple historic lockfiles; after adding adapter dependencies, **regenerate and commit the selected lockfile** before using any frozen install mode:

```bash
bun install --no-frozen-lockfile
npm run cloudflare:build
npm run cf:dry-run --workspace=apps/web
```

`cloudflare:build` builds `packages/sdk`, runs the existing `next build --webpack`, and converts the output to a Cloudflare Worker with OpenNext. The dry run verifies the upload bundle without changing Cloudflare.

## Deploy without VPS

In **Cloudflare > Workers & Pages**, select the account that owns `ai-sdk.pro`. Create/connect Worker `platform-ai-sdk-pro-web` to GitHub `z-ey3eiei/platform.ai-sdk.pro` using Workers Builds. Choose the verified branch (prefer the PR branch while validating):

| Setting | Value |
| --- | --- |
| Root directory | `/` (monorepo root) |
| Build command | `npm run cloudflare:build` |
| Deploy command | `npm run cf:deploy --workspace=apps/web` |
| Preview command | `npm run cf:deploy --workspace=apps/web` only for isolated preview Worker; otherwise disable preview builds until reviewed |
| Runtime | Workers (not Pages/static, Docker or Containers) |

If Cloudflare's automatic dependency install selects a frozen lockfile, regenerate/commit `bun.lock` and `package-lock.json` via an environment with npm/Bun registry access, or configure the install step to use `bun install --no-frozen-lockfile` where supported. Do not report deployment success from the configuration alone.

Alternatively, after authentication with a properly scoped Cloudflare API token, deploy from a machine/CI with network access:

```bash
npm run cloudflare:deploy
```

## Secrets and runtime behavior

In the Worker **Settings > Variables & Secrets**, configure the required server-only credentials (as Secrets), including `NEON_DATABASE_URL`, `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_SECRET`, and any other active backend credentials. Set `BETTER_AUTH_URL` and trusted origins for the **actual HTTPS Worker preview URL** first, then update the production URL during cutover. Update the GitHub OAuth callback URL to match `/api/auth/callback/github`. Set public Firebase config variables at **build time** if the application reads them during bundling. Do not mix Neon production/staging database credentials.

Verify `/`, `/login`, `/workspace`, `/chat`, `/api/health`, `/api/ready`, `/docs` and the GitHub/Firebase authentication flows on the Worker preview URL. Do not point the apex `ai-sdk.pro` at the Worker until the checks pass. Keep the current production route unchanged during the migration.

## Remaining compatibility checks

OpenNext adapts Next.js to Workers, but packages that rely on local file writes, dynamic child processes, Vercel-specific Blob APIs or platform-specific environment variables need separate review. The existing GitHub Actions workflow has been reporting `startup_failure` before any job started; the independent `Cloudflare Worker build` job is a non-deploying check and may also be blocked by the same GitHub Actions account restriction. No tests or live Worker deploy are claimed unless a successful run is observed.

References: https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/ and https://opennext.js.org/cloudflare/get-started
