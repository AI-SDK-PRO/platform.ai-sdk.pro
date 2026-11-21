import "server-only";
import { createPublicKey, verify as verifySignature } from "node:crypto";

// Managed Better Auth blocks sign-up while a `user.before_create` webhook is
// configured and failing, so this endpoint must answer quickly and allow.
export type NeonAuthWebhookResult = {
  status: number;
  body: Record<string, unknown> | null;
};

type Jwk = { kid?: string; kty?: string; crv?: string; x?: string; y?: string };

const JWKS_TTL_MS = 10 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
let cachedJwks: { fetchedAt: number; keys: Jwk[] } | null = null;

function authBaseUrl(): string | null {
  const value = process.env.NEON_AUTH_BASE_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

async function loadJwks(force: boolean): Promise<Jwk[]> {
  const base = authBaseUrl();
  if (!base) throw new Error("NEON_AUTH_BASE_URL is not configured.");
  if (!force && cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_TTL_MS)
    return cachedJwks.keys;
  const response = await fetch(`${base}/.well-known/jwks.json`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load the Neon Auth JWKS.");
  const payload = (await response.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(payload.keys) ? payload.keys : [];
  cachedJwks = { fetchedAt: Date.now(), keys };
  return keys;
}

async function findKey(kid: string | null): Promise<Jwk | null> {
  const keys = await loadJwks(false);
  const match = kid ? keys.find(key => key.kid === kid) : keys[0];
  if (match || !kid) return match ?? null;
  // Key rotation: refresh once before rejecting.
  const refreshed = await loadJwks(true);
  return refreshed.find(key => key.kid === kid) ?? null;
}

export async function verifyNeonAuthSignature(
  rawBody: string,
  headers: Headers
): Promise<boolean> {
  const signature = headers.get("x-neon-signature");
  const timestamp = headers.get("x-neon-timestamp");
  if (!signature || !timestamp) return false;
  const age = Date.now() - Number.parseInt(timestamp, 10);
  if (!Number.isFinite(age) || Math.abs(age) > MAX_CLOCK_SKEW_MS) return false;
  const [header, emptyPayload, signaturePart] = signature.split(".");
  if (!header || emptyPayload !== "" || !signaturePart) return false;
  const jwk = await findKey(headers.get("x-neon-signature-kid"));
  if (!jwk) return false;
  const payloadB64 = Buffer.from(rawBody, "utf8").toString("base64url");
  const signingInput = `${header}.${Buffer.from(
    `${timestamp}.${payloadB64}`,
    "utf8"
  ).toString("base64url")}`;
  try {
    return verifySignature(
      null,
      Buffer.from(signingInput, "utf8"),
      createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(signaturePart, "base64url")
    );
  } catch {
    return false;
  }
}

export function handleNeonAuthEvent(
  event: Record<string, unknown>
): NeonAuthWebhookResult {
  if (event.event_type === "user.before_create")
    return { status: 200, body: { allowed: true } };
  // Every other event is non-blocking; acknowledge without side effects.
  return { status: 200, body: null };
}
