import { jsonError } from "@/lib/platform-policy";
// Never exchange old Firebase tokens into managed Supabase sessions.
export async function POST() {
  return jsonError(
    "Firebase sign-in has been retired. Sign in with Supabase at /login.",
    410
  );
}
export const DELETE = POST;
