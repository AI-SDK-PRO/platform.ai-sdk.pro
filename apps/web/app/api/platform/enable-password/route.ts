import { jsonError } from "@/lib/platform-policy";
export async function POST() {
  return jsonError("Use the Supabase password-reset flow to set a password.", 410);
}
