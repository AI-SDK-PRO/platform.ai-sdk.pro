import { jsonError } from "@/lib/platform-policy";
export async function POST() {
  return jsonError("Use the Neon password-reset flow to set a password.", 410);
}
