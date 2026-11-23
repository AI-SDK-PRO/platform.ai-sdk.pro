import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { PlatformSetupRequiredError } from "./platform-policy";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new PlatformSetupRequiredError();
  return { url, key };
}

function isLoopbackHost(hostHeader: string | null): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.split(",")[0]?.trim() ?? "";
  if (!host) return false;
  try {
    const parsed = new URL(`http://${host}`);
    return LOOPBACK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export async function verifySupabaseEmail(tokenHash: string) {
  const { url, key } = supabaseConfig();
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const primary = await client.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (!primary.error) return true;
  const fallback = await client.auth.verifyOtp({ type: "signup", token_hash: tokenHash });
  return !fallback.error;
}

export async function getSupabaseAuth() {
  const { url, key } = supabaseConfig();
  const jar = await cookies();
  let incomingHeaders: Headers | null = null;
  try {
    incomingHeaders = await headers();
  } catch {
    incomingHeaders = null;
  }
  const forwardedProto = incomingHeaders?.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = incomingHeaders?.get("x-forwarded-host") || incomingHeaders?.get("host") || null;
  const loopback = isLoopbackHost(host);
  const configuredHttps = (process.env.BETTER_AUTH_URL?.trim() || "").startsWith("https://");
  const isHttps =
    forwardedProto === "https" ||
    (forwardedProto !== "http" && !loopback && (process.env.NODE_ENV === "production" || configuredHttps));
  const isCrossSiteIframe =
    isHttps && incomingHeaders?.get("sec-fetch-dest")?.trim() === "iframe";

  const cookieOptions = isCrossSiteIframe
    ? ({ secure: true, sameSite: "none", partitioned: true } as const)
    : ({ secure: isHttps, sameSite: "lax" } as const);

  return createServerClient(url, key, {
    cookieOptions,
    cookies: {
      getAll: () => jar.getAll(),
      setAll: values => {
        try {
          for (const { name, value, options } of values) {
            jar.set(name, value, {
              ...options,
              httpOnly: true,
              secure: isHttps,
              sameSite: isCrossSiteIframe ? "none" : "lax",
              ...(isCrossSiteIframe ? { partitioned: true } : {}),
            });
          }
        } catch {
          // Server Components cannot mutate cookies; Route Handlers commit them.
        }
      },
    },
  }).auth;
}
