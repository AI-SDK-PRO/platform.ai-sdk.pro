# Deploy the web application to Cloudflare Workers (no VPS)

This repository is an npm-workspaces monorepo. The site is **apps/web** (Next.js 16);
the root has the workspace lockfile and the internal SDK dependency.

The Workers deployment uses OpenNext to preserve Next.js route handlers, dynamic
pages, Firebase sign-in, and existing workspace code. It does not depend on
Docker, SSH, Coolify, the VPS, or a running Node.js server.

## Cloudflare Workers Builds

1. In the Cloudflare account that owns `ai-sdk.pro`, create or connect a
   **Worker** to GitHub repository `z-ey3eiei/platform.ai-sdk.pro`.
2. Choose the branch containing this change for the first verification.
3. Configure the build:
   - **Root directory:** `/` (repository root, not `apps/web`)
   - **Build command:** `npm run cloudflare:build`
   - **Deploy command:** `npm run cloudflare:deploy`
   - **Node.js version:** 22
   - **Framework preset:** None / custom
4. The Worker is named `aisdkpro-web-cloudflare` in
   `apps/web/wrangler.jsonc`. Keep the `*.workers.dev` URL enabled for
   verification. **Do not replace the live `ai-sdk.pro` DNS yet.**
5. Configure runtime secrets in Worker Settings → Variables & Secrets.
   Keep secrets out of Git and the `NEXT_PUBLIC_` prefix.
   At minimum, configure values required by enabled features:
   - `NEON_DATABASE_URL` if using the Neon-backed platform features;
   - `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` and GitHub OAuth keys if
     those integrations are enabled;
   - `PLATFORM_BRIDGE_SECRET` (same secret as the existing Cloudflare
     deployment-control Worker) and
     `PLATFORM_DEPLOY_ORIGIN=https://deploy-staging.ai-sdk.pro` for the
     deploy dashboard; this requires the bridge to be enabled server-side;
   - any app-specific `APP_ORIGINS`, `GITHUB_APP_SLUG` and Firebase-related
     settings currently in use.
   - Set public `NEXT_PUBLIC_*` values also in **Build variables** as
     necessary; unlike runtime secrets, these are embedded at build time.
6. Check the preview homepage, `/login`, `/workspace`, `/api/health`
   and `/api/ready`. Only point a production domain to this Worker after
   those routes and sign-in have been verified.

## Commands

From the repository root:

```sh
npm ci
npm run cloudflare:build
npm run cloudflare:deploy
```

`cloudflare:build` installs pinned OpenNext/Wrangler tooling **without
modifying the existing lockfile or workspace manifests**, builds the internal
SDK, then compiles the Next.js app with OpenNext. This intentionally isolates
Cloudflare-specific deployment tooling from the VPS/GitHub validation build.
The `cloudflare:deploy` script deploys the built artifact using Wrangler.

Workers Builds may run npm install automatically; preserve the root workspace
directory so `packages/sdk` and `packages/ui` resolve correctly.

## Scope and safety

- This change deploys the **web application** on Cloudflare Workers.
- `infra/cloudflare-platform` already contains a **separate** Cloudflare
  control plane. Its Worker, resources and routes are not rewritten here.
- The deploy dashboard currently calls a separate Cloudflare Worker using
  `PLATFORM_DEPLOY_ORIGIN`. The web deploy alone does not enable tenant
  project builds or change the server-side public-deploy feature flags.
- No Cloudflare DNS, production hostnames, database resources, secrets, or
  existing Cloudflare Worker deployments are changed by this commit.
- GitHub Actions `startup_failure` with zero jobs is a GitHub Actions
  execution/startup problem, not evidence of a Next.js compilation failure;
  use Workers Builds logs to verify this deployment.
