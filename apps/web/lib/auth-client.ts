"use client";

import { createAuthClient } from "better-auth/react";

function resolveClientBaseURL(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  const envUrl = process.env.BETTER_AUTH_URL?.trim();
  if (envUrl && /^https?:\/\//.test(envUrl)) {
    return envUrl;
  }
  return "https://platform.ai-sdk.pro";
}

/**
 * The browser client deliberately has no provider credentials or user identity
 * configuration. Better Auth owns the OAuth state and session cookie exchange.
 */
export const authClient = createAuthClient({
  baseURL: resolveClientBaseURL(),
  fetchOptions: {
    credentials: "include",
  },
});
