# AWS Amplify Hosting

> **Deployment blocker:** this repository currently uses Next.js 16.4.6 in `apps/web`. AWS Amplify Hosting's managed Next.js SSR documentation currently lists support through Next.js 15. The checked-in build spec is prepared for the monorepo layout, but this repo is **not ready to deploy on Amplify until the Next.js version is made compatible or AWS adds Next.js 16 support**. Do not treat a successful build step alone as proof that Amplify can host the app.

## What the build spec targets

- Main application: `apps/web`
- Package manager: npm workspaces, using the root `package-lock.json`
- Build runtime: Node.js 22 (`nvm use 22` in `amplify.yml`; use an Amplify AL2023 build image)
- Build command: root `npm run build` (builds the shared SDK, create-webapp package, and web app)
- Next.js build output: `apps/web/.next`
- Monorepo build root: repository root

The repository-root `amplify.yml` uses Amplify's monorepo `applications` syntax, sets `appRoot: apps/web`, and builds from the repository root.

## Before creating an Amplify app

1. Resolve the Next.js 16 compatibility blocker. The supported path documented by AWS Amplify is currently Next.js 12–15. Moving this app to Next.js 15 is a framework downgrade and must be checked against the app's APIs and dependencies before deployment.
2. Select an Amplify AL2023 build image so Node.js 22 is available; the build spec pins it with `nvm use 22`.
3. In AWS Amplify, create or connect an app from `AI-SDK-PRO/platform.ai-sdk.pro` and select the intended branch.
4. Choose the monorepo option and set the app root to `apps/web`. Confirm the branch has `AMPLIFY_MONOREPO_APP_ROOT=apps/web`; Amplify normally creates this value when the monorepo app root is selected.
5. Add the runtime environment variables required by the app in Amplify's branch settings. Use the current application configuration as the source of truth; keep secrets in Amplify and never commit them.
6. After compatibility is resolved, start a build and inspect both the build log and the deployed URL.

## Scope and routing

This build spec deploys only `apps/web`. The repository also contains a separate Next.js app in `apps/docs`. Vercel's `vercel.json` routes `/docs` to that second app; Amplify does not automatically apply those Vercel service rewrites. The docs app therefore needs its own hosting and routing plan (for example, a separate Amplify app on a docs subdomain, or a deliberate integration into `apps/web`) if the `/docs` path must work.

## AWS reference

- [Amplify support for Next.js](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html)
- [Amplify monorepo configuration](https://docs.aws.amazon.com/amplify/latest/userguide/monorepo-configuration.html)
- [Deploying a Next.js SSR app to Amplify](https://docs.aws.amazon.com/amplify/latest/userguide/deploy-nextjs-app.html)
