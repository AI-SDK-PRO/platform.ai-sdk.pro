import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { PlatformSetupRequiredError } from "./platform-policy";

export async function getSupabaseAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new PlatformSetupRequiredError();
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
