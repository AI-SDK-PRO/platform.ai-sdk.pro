# Cloudflare Workers Builds: platform API

This repository contains a Next.js application for VPS and separate Cloudflare Workers. Deploy the platform Worker from its own directory; the root `build` script builds the VPS web app and is not a Cloudflare Worker build command.

Use these settings for the existing platform API Worker:

| Setting | Value |
| --- | --- |
| Repository | `z-ey3eiei/platform.ai-sdk.pro` |
| Production branch | `main` |
| Root directory | `infra/cloudflare-platform` |
| Build command | Leave empty; Wrangler bundles the Worker during deploy |
| Deploy command | `npx wrangler deploy --config wrangler.jsonc` |
| Worker name | `aisdkpro-platform-api-staging` (must match `wrangler.jsonc`) |

This directory has its own `package.json` and npm `package-lock.json`. It does not need the root Next.js build. Keep all existing bindings and secrets attached to the intended Worker. This command deploys the platform API, Workflow and configured sandbox bindings; it does not deploy the separate dispatch Worker or the keyless-agent Worker.

The API Worker proxies `platform.ai-sdk.pro` application requests to the VPS origin configured in `WORKSPACE_WEB_ORIGIN`. Deploying this Worker does not update the Next.js app on VPS. The Firebase login UI and server session routes are part of that VPS application.

## Frozen Bun lockfile failure at repository root

The root `bun.lock` must be regenerated whenever any root workspace `package.json` changes. Refresh it with Bun 1.4.4:

```sh
bun install --lockfile-only --ignore-scripts
```

Confirm the lockfile is accepted without executing dependency scripts or a test suite:

```sh
bun install --frozen-lockfile --lockfile-only --ignore-scripts
```

Commit `bun.lock` together with the dependency change. This repairs the dependency installation error; the Worker settings above also avoid attempting to deploy the VPS application from the repository root.
