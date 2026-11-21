import "server-only";
import { createNeonAuth } from "@neon/auth/next/server";
import { PlatformSetupRequiredError } from "./platform-policy";

// Lazy initialization allows builds and public pages without runtime credentials.
export function getAuth() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL?.trim();
  const secret =
    process.env.NEON_AUTH_COOKIE_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim();
  if (!baseUrl || !secret || secret.length < 32)
    throw new PlatformSetupRequiredError();
  try {
    const url = new URL(baseUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new PlatformSetupRequiredError();
  }
  return createNeonAuth({
    baseUrl,
    cookies: { secret, sameSite: "lax" },
    logLevel: "error",
  });
}
