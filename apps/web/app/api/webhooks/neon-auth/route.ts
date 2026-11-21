import { jsonError } from "@/lib/platform-policy";
import {
  handleNeonAuthEvent,
  verifyNeonAuthSignature,
} from "@/lib/neon-auth-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  let verified = false;
  try {
    verified = await verifyNeonAuthSignature(rawBody, request.headers);
  } catch {
    return jsonError("Neon Auth webhook verification is unavailable.", 503);
  }
  if (!verified) return jsonError("Invalid webhook signature.", 401);
  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    event = parsed as Record<string, unknown>;
  } catch {
    return jsonError("Invalid webhook payload.", 400);
  }
  const result = handleNeonAuthEvent(event);
  return result.body
    ? Response.json(result.body, { status: result.status })
    : new Response(null, { status: result.status });
}
