import { jsonError } from "@/lib/platform-policy";
// Never exchange old Firebase tokens into managed Neon sessions.
export async function POST() {
  return jsonError(
    "Firebase sign-in has been retired. Sign in with Neon at /login.",
    410
  );
}
export const DELETE = POST;
