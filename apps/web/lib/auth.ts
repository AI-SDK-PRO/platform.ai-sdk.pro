import "server-only";
import { getAuth } from "./neon-auth";
import { getPlatformDb } from "./db/client";
import { user } from "./db/schema";
import {
  PlatformAuthenticationError,
  PlatformSetupRequiredError,
} from "./platform-policy";
import { readConnectedGitHubToken } from "./github-connection";
export { getAuth } from "./neon-auth";

const AUTH_ENDPOINTS = new Set([
  "POST sign-up/email",
  "POST sign-in/email",
  "POST sign-in/social",
  "POST sign-out",
  "GET get-session",
  "POST send-verification-email",
  "GET verify-email",
  "POST request-password-reset",
  "GET reset-password",
  "POST reset-password",
  "POST update-user",
  "POST change-password",
  "POST link-social",
  "GET list-accounts",
]);
export function isAllowedAuthEndpoint(method: string, path: string): boolean {
  return AUTH_ENDPOINTS.has(`${method} ${path}`);
}
export class GitHubConnectionRequiredError extends Error {
  readonly status = 409;
  constructor() {
    super("Connect GitHub in account settings.");
    this.name = "GitHubConnectionRequiredError";
  }
}
export async function getManagedSession() {
  // Validate against Neon rather than accepting the former Firebase JWT or
  // a cached client identity. Revoked sessions must not authorize API writes.
  const { data, error } = await getAuth().getSession({
    // @neon/auth 0.8.2 compares this query value to the STRING "true"
    // before serializing the request, although Better Auth types it boolean.
    query: { disableCookieCache: "true" as unknown as boolean },
  });
  if (error)
    throw new PlatformSetupRequiredError("Authentication service unavailable.");
  return data;
}
export async function getSessionUser(_request: Request) {
  const session = await getManagedSession();
  if (!session?.user || session.user.emailVerified !== true) return null;
  const identity = session.user;
  const db = getPlatformDb();
  if (!db) throw new PlatformSetupRequiredError();
  const now = new Date();
  // Keep existing app foreign keys without managing passwords or auth sessions
  // ourselves. Identity is keyed only by Neon's verified ID, never by email.
  await db
    .insert(user)
    .values({
      id: identity.id,
      name: identity.name,
      email: identity.email,
      emailVerified: true,
      image: identity.image ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: user.id,
      set: {
        name: identity.name,
        email: identity.email,
        emailVerified: true,
        image: identity.image ?? null,
        updatedAt: now,
      },
    });
  return { ...publicUser(identity), emailVerified: true };
}
export async function requireSessionUser(request: Request) {
  const current = await getSessionUser(request);
  if (!current) throw new PlatformAuthenticationError();
  return current;
}
export async function getGitHubAccessToken(
  _request: Request,
  userId: string
): Promise<string> {
  const token = await readConnectedGitHubToken(userId);
  if (!token) throw new GitHubConnectionRequiredError();
  return token;
}
export function publicUser(value: {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}) {
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    image: value.image ?? null,
  };
}
