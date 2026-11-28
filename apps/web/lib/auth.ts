import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { account, authTables } from "./db/schema";
import { getPlatformDb } from "./db/client";
import { readConnectedGitHubToken } from "./github-connection";
import { PlatformAuthenticationError, requirePlatformConfig, trustedPlatformOrigins } from "./platform-policy";
import { PLATFORM_SESSION_POLICY } from "./session-policy";

const AUTH_ENDPOINTS = new Set([
  "GET get-session", "POST get-session", "POST sign-in/social", "POST sign-out",
  "GET callback/google", "POST callback/google",
]);

export function isAllowedAuthEndpoint(method: string, path: string) {
  return AUTH_ENDPOINTS.has(`${method} ${path}`);
}

export class GitHubConnectionRequiredError extends Error {
  readonly status = 409;
  constructor() { super("Connect GitHub in account settings."); this.name = "GitHubConnectionRequiredError"; }
}

let authInstance: ReturnType<typeof createPlatformAuth> | null = null;
let authCacheKey = "";

export function createPlatformAuth() {
  const config = requirePlatformConfig();
  const database = getPlatformDb();
  if (!database) throw new Error("Platform database is unavailable.");
  const secureCookies = config.baseURL.startsWith("https://");
  const productionGoogleRedirect = secureCookies
    ? process.env.GOOGLE_REDIRECT_URI?.trim() || "https://www.ai-sdk.pro/auth/platform"
    : undefined;
  return betterAuth({
    appName: "ai-sdk.pro",
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    database: drizzleAdapter(database, {
      provider: "pg", schema: authTables, schemaName: "aisdk_pro",
      transaction: false, debugLogs: false,
    }),
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        ...(productionGoogleRedirect ? { redirectURI: productionGoogleRedirect } : {}),
        prompt: "select_account",
      },
    },
    account: {
      accountLinking: { enabled: true, disableImplicitLinking: true },
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
    },
    session: PLATFORM_SESSION_POLICY,
    advanced: {
      useSecureCookies: secureCookies,
      defaultCookieAttributes: {
        httpOnly: true, secure: secureCookies,
        sameSite: secureCookies ? "lax" : "lax", path: "/",
      },
      ...(secureCookies ? { crossSubDomainCookies: { enabled: true, domain: "ai-sdk.pro" } } : {}),
    },
    trustedOrigins: trustedPlatformOrigins(config),
    logger: { disabled: true },
  });
}

export function getAuth() {
  const config = requirePlatformConfig();
  const key = `${config.baseURL}:${config.googleClientId}:${config.databaseUrl}`;
  if (!authInstance || authCacheKey !== key) {
    authInstance = createPlatformAuth();
    authCacheKey = key;
  }
  return authInstance;
}

export function resetAuthForTests() { authInstance = null; authCacheKey = ""; }

export async function getManagedSession(request: Request) {
  return getAuth().api.getSession({ headers: request.headers, query: { disableRefresh: true } });
}

export async function getSessionUser(request: Request) {
  const session = await getManagedSession(request);
  if (!session?.user || !session.user.emailVerified) return null;
  return { ...publicUser(session.user), emailVerified: true };
}

export async function requireSessionUser(request: Request) {
  const user = await getSessionUser(request);
  if (!user) throw new PlatformAuthenticationError();
  return user;
}

export async function getGitHubAccessToken(_request: Request, userId: string) {
  const token = await readConnectedGitHubToken(userId);
  if (!token) throw new GitHubConnectionRequiredError();
  return token;
}

export function publicUser(value: { id: string; name: string; email: string; image?: string | null; emailVerified?: boolean }) {
  return { id: value.id, name: value.name, email: value.email, image: value.image ?? null, ...(value.emailVerified !== undefined ? { emailVerified: value.emailVerified } : {}) };
}
