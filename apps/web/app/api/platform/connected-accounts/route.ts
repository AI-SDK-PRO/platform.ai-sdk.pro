import { getSupabaseAuth } from "@/lib/supabase-auth";
import { eq } from "drizzle-orm";
import { requireSessionUser } from "@/lib/auth";
import { getPlatformDb } from "@/lib/db/client";
import { account } from "@/lib/db/schema";
import {
  noStoreHeaders,
  jsonError,
  safePlatformError,
} from "@/lib/platform-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireSessionUser(request);
    const db = getPlatformDb();
    if (!db) return jsonError("Account storage is unavailable.", 503);
    const linked = await db
      .select({ providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, user.id));
    const { data: methods, error } = await (await getSupabaseAuth()).getUserIdentities();
    if (error) return jsonError("Sign-in methods are unavailable.", 502);
    return Response.json(
      {
        github: linked.some(row => row.providerId === "github-repository"),
        googleLogin: methods?.identities.some(row => row.provider === "google") ?? false,
        githubLogin: methods?.identities.some(row => row.provider === "github") ?? false,
        password:
          methods?.identities.some(row => row.provider === "email") ?? false,
        authProvider: "supabase",
        emailVerified: true,
        email: user.email,
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    const safe = safePlatformError(error);
    return jsonError(safe.message, safe.status);
  }
}
