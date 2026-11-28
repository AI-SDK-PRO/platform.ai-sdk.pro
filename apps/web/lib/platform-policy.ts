import type { PlatformStatus } from "./platform-types";
import { SNAPSHOT_LIMITS } from "./platform-types";

export const DEFAULT_PLATFORM_URL = "https://platform.ai-sdk.pro";
const CANONICAL_PLATFORM_ORIGINS = [
  "https://platform.ai-sdk.pro",
  "https://ai-sdk.pro",
  "https://www.ai-sdk.pro",
] as const;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export class PlatformSetupRequiredError extends Error {
  readonly status = 503;
  constructor(message = "The platform is not configured yet.") {
    super(message);
    this.name = "PlatformSetupRequiredError";
  }
}
export class PlatformAuthenticationError extends Error {
  readonly status = 401;
  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "PlatformAuthenticationError";
  }
}
export type PlatformConfig = {
  baseURL: string;
  baseOrigin: string;
  secret: string;
  databaseUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  githubClientId: string;
  githubClientSecret: string;
  githubAppSlug: string;
  githubConfigured: boolean;
  emailRegistrationAvailable: boolean;
  missingConfiguration: string[];
  configured: boolean;
};

function validBaseURL(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.pathname !== "/" || url.search || url.hash) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname))
      return null;
    return url;
  } catch {
    return null;
  }
}

function normalizeVercelOrigin(hostOrUrl: string | undefined): string | null {
  const trimmed = hostOrUrl?.trim();
  if (!trimmed) return null;
  const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  const parsed = validBaseURL(candidate);
  return parsed?.protocol === "https:" ? parsed.origin : null;
}

export function getPlatformConfig(): PlatformConfig {
  const configuredUrl =
    process.env.BETTER_AUTH_URL?.trim() ||
    (process.env.NODE_ENV === "production" ? "https://ai-sdk.pro" : "http://localhost:3000");
  const base = validBaseURL(configuredUrl);
  const databaseUrl = process.env.NEON_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
  const secret = process.env.BETTER_AUTH_SECRET?.trim() || "";
  const missingConfiguration: string[] = [];
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl))
    missingConfiguration.push("NEON_DATABASE_URL");
  if (secret.length < 32) missingConfiguration.push("BETTER_AUTH_SECRET");
  if (!base) missingConfiguration.push("BETTER_AUTH_URL");
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
  if (!googleClientId) missingConfiguration.push("GOOGLE_CLIENT_ID");
  if (!googleClientSecret) missingConfiguration.push("GOOGLE_CLIENT_SECRET");
  const rawAppSlug = process.env.GITHUB_APP_SLUG?.trim() || "ai-sdk-pro";
  const githubAppSlug = rawAppSlug
    .replace(/^https:\/\/github\.com\/apps\//i, "")
    .replace(/\/.*$/, "");
  if (
    githubAppSlug &&
    !/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/i.test(githubAppSlug)
  ) {
    missingConfiguration.push("GITHUB_APP_SLUG");
  }
  const baseURL = base?.origin ?? DEFAULT_PLATFORM_URL;
  const configured = Boolean(base) && missingConfiguration.length === 0;
  const githubConfigured = Boolean(
    process.env.GITHUB_CLIENT_ID?.trim() &&
      process.env.GITHUB_CLIENT_SECRET?.trim()
  );
  const emailRegistrationAvailable = false;
  return {
    baseURL,
    baseOrigin: baseURL,
    secret,
    databaseUrl,
    googleClientId,
    googleClientSecret,
    githubClientId: process.env.GITHUB_CLIENT_ID?.trim() || "",
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET?.trim() || "",
    githubAppSlug,
    githubConfigured,
    emailRegistrationAvailable,
    missingConfiguration: [...new Set(missingConfiguration)],
    configured,
  };
}

export function requirePlatformConfig(): PlatformConfig {
  const config = getPlatformConfig();
  if (!config.configured) throw new PlatformSetupRequiredError();
  return config;
}

export function platformStatus(): PlatformStatus {
  const config = getPlatformConfig();
  return {
    configured: config.configured,
    githubConfigured: config.githubConfigured,
    emailRegistrationAvailable: config.emailRegistrationAvailable,
    missingConfiguration: config.missingConfiguration,
    githubAppInstallUrl: config.githubAppSlug
      ? `https://github.com/apps/${encodeURIComponent(config.githubAppSlug)}/installations/new`
      : null,
    snapshotLimits: SNAPSHOT_LIMITS,
  };
}

export function trustedPlatformOrigins(config = getPlatformConfig()): string[] {
  const origins = [config.baseOrigin];
  if (
    CANONICAL_PLATFORM_ORIGINS.includes(
      config.baseOrigin as (typeof CANONICAL_PLATFORM_ORIGINS)[number]
    )
  ) {
    origins.push(...CANONICAL_PLATFORM_ORIGINS);
  }
  for (const hostOrigin of [
    normalizeVercelOrigin(process.env.DOMAIN),
    normalizeVercelOrigin(process.env.PLATFORM_DOMAIN),
    normalizeVercelOrigin(process.env.VERCEL_URL),
    normalizeVercelOrigin(process.env.VERCEL_BRANCH_URL),
    normalizeVercelOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  ]) {
    if (hostOrigin) origins.push(hostOrigin);
  }
  const extraOrigins = (process.env.APP_ORIGINS ?? "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  for (const candidate of extraOrigins) {
    const parsed = validBaseURL(candidate);
    if (parsed) origins.push(parsed.origin);
  }
  try {
    const url = new URL(config.baseOrigin);
    if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))
      origins.push(url.origin);
  } catch {
    // Invalid configuration is reported by status; auth never initializes.
  }
  return [...new Set(origins)];
}

export function resolvePublicOrigin(
  request: Request,
  config = getPlatformConfig()
): string {
  const trusted = trustedPlatformOrigins(config);
  const candidates: string[] = [];
  if (process.env.TRUST_PROXY === "true") {
    const forwardedHost = request.headers
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim();
    const forwardedProto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      "https";
    if (
      forwardedHost &&
      (forwardedProto === "https" || forwardedProto === "http")
    ) {
      candidates.push(`${forwardedProto}://${forwardedHost}`);
    }
  }
  const originHeader = request.headers.get("origin");
  if (originHeader) candidates.push(originHeader);
  try {
    const reqUrl = new URL(request.url);
    candidates.push(reqUrl.origin);
    if (reqUrl.protocol === "http:" && LOOPBACK_HOSTS.has(reqUrl.hostname)) {
      return reqUrl.origin;
    }
  } catch {
    // Fallback to config.baseURL below.
  }
  for (const candidate of candidates) {
    if (trusted.includes(candidate)) return candidate;
  }
  return config.baseURL;
}

export function isTrustedMutationOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (trustedPlatformOrigins().includes(origin)) return true;
  try {
    const incoming = new URL(origin);
    const reqUrl = new URL(request.url);
    if (
      incoming.protocol === "http:" &&
      LOOPBACK_HOSTS.has(incoming.hostname) &&
      reqUrl.protocol === "http:" &&
      (LOOPBACK_HOSTS.has(reqUrl.hostname) || reqUrl.hostname === "0.0.0.0") &&
      incoming.port === reqUrl.port
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function noStoreHeaders(): Headers {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

export function jsonError(message: string, status: number): Response {
  return Response.json(
    { error: message },
    { status, headers: noStoreHeaders() }
  );
}

export function safePlatformError(error: unknown): {
  message: string;
  status: number;
} {
  if (error instanceof PlatformSetupRequiredError)
    return { message: "Platform setup is required.", status: 503 };
  if (error instanceof PlatformAuthenticationError) {
    const message =
      error.message &&
      error.message.length <= 180 &&
      !/secret|token|password|private|postgres|sql/i.test(error.message)
        ? error.message
        : "Authentication is required.";
    return { message, status: 401 };
  }
  if (error instanceof Error && error.name === "GitHubConnectionRequiredError")
    return { message: "Connect GitHub in account settings.", status: 409 };
  if (error instanceof Error && error.name === "GitHubPermissionError")
    return {
      message: "GitHub access was denied for this repository.",
      status: 403,
    };
  if (error instanceof Error && error.name === "GitHubRateLimitError")
    return {
      message: "GitHub is rate limiting requests. Try again later.",
      status: 429,
    };
  if (error instanceof Error && error.name === "PlatformRequestTimeoutError")
    return {
      message: "The repository request timed out. Try again later.",
      status: 504,
    };
  return {
    message: "The platform request could not be completed.",
    status: 500,
  };
}

const requestBuckets = new Map<
  string,
  { windowStart: number; count: number }
>();
export function checkPlatformRateLimit(
  userId: string,
  bucket = "read",
  now = Date.now()
): boolean {
  const key = `${bucket}:${userId}`;
  const windowMs = bucket === "import" ? 60_000 : 10_000;
  const max = bucket === "import" ? 2 : 30;
  const current = requestBuckets.get(key);
  if (!current || now - current.windowStart >= windowMs) {
    requestBuckets.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (current.count >= max) return false;
  current.count += 1;
  return true;
}
export function resetPlatformRateLimitsForTests(): void {
  requestBuckets.clear();
}
