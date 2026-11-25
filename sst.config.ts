const secret = (name: string) => new sst.Secret(name, "").value;

const secretEnvironment = {
  SUPABASE_DB_URL: secret("SupabaseDbUrl"),
  BETTER_AUTH_SECRET: secret("BetterAuthSecret"),
  GITHUB_CLIENT_SECRET: secret("GithubClientSecret"),
  GITHUB_DEPLOY_WEBHOOK_SECRET: secret("GithubDeployWebhookSecret"),
  GEMINI_API_KEY: secret("GeminiApiKey"),
  AI_API_KEY: secret("AiApiKey"),
  ANTHROPIC_API_KEY: secret("AnthropicApiKey"),
  AGENT_AUTH_SECRET: secret("AgentAuthSecret"),
  PLATFORM_BRIDGE_SECRET: secret("PlatformBridgeSecret"),
  FLAGS_SECRET: secret("FlagsSecret"),
  RESEND_API_KEY: secret("ResendApiKey"),
  BLOB_READ_WRITE_TOKEN: secret("BlobReadWriteToken"),
  MCP_AUTH_TOKEN: secret("McpAuthToken"),
  GOOGLE_MAPS_API_KEY: secret("GoogleMapsApiKey"),
};

const publicEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "https://ai-sdk.pro",
  APP_ORIGINS:
    process.env.APP_ORIGINS ??
    "https://ai-sdk.pro,https://www.ai-sdk.pro,https://platform.ai-sdk.pro",
  TRUST_PROXY: process.env.TRUST_PROXY ?? "true",
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? "",
  GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG ?? "",
  BYOK_ONLY: process.env.BYOK_ONLY ?? "true",
  AI_PROVIDER: process.env.AI_PROVIDER ?? "",
  AI_MODEL: process.env.AI_MODEL ?? "",
  AI_BASE_URL: process.env.AI_BASE_URL ?? "",
  NEXT_PUBLIC_CF_AGENT_URL: process.env.NEXT_PUBLIC_CF_AGENT_URL ?? "",
  PLATFORM_DEPLOY_ORIGIN: process.env.PLATFORM_DEPLOY_ORIGIN ?? "",
  DEPLOY_EXPERIMENTS_ENABLED: process.env.DEPLOY_EXPERIMENTS_ENABLED ?? "",
  PLATFORM_EMAIL_AUTH_ENABLED:
    process.env.PLATFORM_EMAIL_AUTH_ENABLED ?? "true",
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL ?? "",
  BLOB_UPLOADS_ENABLED: process.env.BLOB_UPLOADS_ENABLED ?? "false",
  MCP_SERVER_URL: process.env.MCP_SERVER_URL ?? "",
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
};

export default $config({
  app(input) {
    return {
      name: "ai-sdk-pro",
      home: "aws",
      removal: input?.stage === "production" ? "retain" : "remove",
    };
  },
  async run() {
    const web = new sst.aws.Nextjs("PlatformWeb", {
      path: "apps/web",
      server: {
        runtime: "nodejs22.x",
        timeout: "60 seconds",
      },
      environment: {
        ...secretEnvironment,
        ...publicEnvironment,
      },
    });

    return {
      url: web.url,
    };
  },
});
