import "server-only";
import { getSupabaseAuth } from "./supabase-auth";
import { eq } from "drizzle-orm";
import { authIdentity } from "./db/schema";
import { getPlatformDb } from "./db/client";
import { user } from "./db/schema";
import {
  PlatformAuthenticationError,
  PlatformSetupRequiredError,
} from "./platform-policy";
import { readConnectedGitHubToken } from "./github-connection";


const AUTH_ENDPOINTS = new Set([
  "POST sign-up/email",
  "POST sign-in/email",
  "POST sign-in/social",
  "POST sign-out",
  "GET get-session",
  "POST send-verification-email",
  "POST request-password-reset",
  "POST reset-password",
  "POST link-social",
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
  const auth = await getSupabaseAuth();
  const { data, error } = await auth.getUser();
  if (error) {
    if (error.name === "AuthSessionMissingError" || error.status === 401 || error.status === 403)
      return null;
    throw new PlatformSetupRequiredError("Authentication service unavailable.");
  }
  const current = data.user;
  if (!current?.email || !current.email_confirmed_at) return null;
  const { data: state } = await auth.getSession();
  const expiresAt = state.session?.expires_at;
  if (!expiresAt) return null;
  const metadata = current.user_metadata;
  return {
    user: {
      id: current.id,
      name: typeof metadata.name === "string" ? metadata.name : current.email,
      email: current.email,
      emailVerified: true,
      image: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
    },
    session: { expiresAt: expiresAt * 1000 },
  };
}

export async function getSessionUser(_request: Request) {
  const session = await getManagedSession();
  if (!session?.user || session.user.emailVerified !== true) return null;

  const db = getPlatformDb();
  if (!db) throw new PlatformSetupRequiredError();
  const [mapped] = await db.select({ userId: authIdentity.userId }).from(authIdentity)
    .where(eq(authIdentity.supabaseId, session.user.id));
  const identity = { ...session.user, id: mapped?.userId ?? session.user.id };
  const now = new Date();
  // Keep existing app foreign keys without managing passwords or auth sessions
  // ourselves. Identity is keyed only by a verified Supabase ID or an explicit migration mapping, never by email.
  try {
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
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "23505") {
      throw new PlatformAuthenticationError(
        "This email belongs to a legacy account that requires explicit identity mapping."
      );
    }
    throw error;
  }
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
