import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { PlatformSetupRequiredError } from "./platform-policy";

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new PlatformSetupRequiredError();
  return { url, key };
}

export async function verifySupabaseEmail(tokenHash: string) {
  const { url, key } = supabaseConfig();
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  return !error;
}

export async function getSupabaseAuth() {
  const { url, key } = supabaseConfig();
  const jar = await cookies();
  return createServerClient(url, key, {
    cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax" },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: values => {
        for (const { name, value, options } of values)
          jar.set(name, value, { ...options, httpOnly: true });
      },
    },
  }).auth;
}
