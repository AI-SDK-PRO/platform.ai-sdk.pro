# Deploy ai-sdk.pro on AWS Lambda

This repository uses SST with the OpenNext AWS adapter to deploy the Next.js application on AWS Lambda behind CloudFront. This keeps the app on Next.js 16 and avoids Amplify Hosting's managed SSR version limit.

## What is configured

- SST stack definition: `sst.config.ts`
- App deployed: `apps/web`
- AWS-specific OpenNext config: `apps/web/open-next.aws.config.ts`
- Existing Cloudflare OpenNext config remains in `apps/web/open-next.config.ts`
- Adapter: `@opennextjs/aws@3.9.14`, the version SST currently selects for Next.js 15 and newer
- The adapter build runs the repository root `npm run build`, so shared npm workspace packages are built before the Next.js app.
- Lambda runtime: Node.js 22. The deployment returns a CloudFront URL; no custom domain or DNS is changed by this setup.

SST's AWS Next.js component uses OpenNext to package Next.js for AWS. OpenNext targets Next.js 15 and 16, with some features still marked as work in progress. This repository's exact application build has not been run against AWS in this change, so review the first build output before serving production traffic.

## Set configuration

1. Use AWS credentials that can create the stack's CloudFormation, IAM, Lambda, CloudFront, S3, and related cache resources. Check the account and selected region:

   ```sh
   aws sts get-caller-identity
   aws configure list
   ```

   If using a named profile, set `AWS_PROFILE` for the SST commands below.

2. Copy `.env.aws.example` to the ignored root `.env` and fill its public/non-secret settings. In particular, set the actual public Supabase URL and publishable key, and the production `BETTER_AUTH_URL` and `APP_ORIGINS`.

3. Store the required secrets in the production SST stage. The values are stored as SST secrets; they are not checked into Git:

   ```sh
   npx sst@latest secret set SupabaseDbUrl '<Supabase Postgres connection URL>' --stage production
   npx sst@latest secret set BetterAuthSecret '<long random secret>' --stage production
   ```

   For GitHub repo import, also set `GithubClientSecret`. Set optional keys only for features you enable: `GithubDeployWebhookSecret`, `GeminiApiKey`, `AiApiKey`, `AnthropicApiKey`, `AgentAuthSecret`, `PlatformBridgeSecret`, `FlagsSecret`, `ResendApiKey`, `BlobReadWriteToken`, `McpAuthToken`, and `GoogleMapsApiKey`. The matching public GitHub client ID belongs in `.env`.

## Deploy

From the repository root:

```sh
npx sst@latest deploy --stage production
```

SST prints the deployed URL. This command creates or updates AWS resources; it is intentionally left for you to run.

## Scope to plan for

- This stack deploys `apps/web` only. `apps/docs` is a separate Next.js app, and this configuration does not route `/docs` or configure `docs.ai-sdk.pro`.
- No custom domain, certificate, or DNS record is configured. Test the returned CloudFront URL first, then configure the domain separately.
- The AWS account used in the earlier Amplify attempt returned an Organizations SCP denial for Amplify API access. SST uses CloudFormation and provisions Lambda/CloudFront resources directly, but AWS Organizations policies may also restrict those services. If the deployment reports `AccessDenied`, the account administrator will need to allow the required resource creation actions.
- Do not deploy from `amplify.yml`; this AWS path uses SST/OpenNext instead.

## References

- [SST Next.js component](https://sst.dev/docs/component/aws/nextjs/)
- [OpenNext AWS setup](https://opennext.js.org/aws/get_started)
- [OpenNext AWS compatibility](https://opennext.js.org/aws/compatibility)
- [SST environment variables and secrets](https://sst.dev/docs/environment-variables/)
