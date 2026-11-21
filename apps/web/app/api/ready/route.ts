import { isBYOKRequired, isServerGeminiConfigured } from "@/lib/byok-policy";
import { GEMINI_SERVER_MODEL } from "@/lib/gemini-agent";
import { publicModelConfig } from "@/lib/provider";

export const dynamic = "force-dynamic";

export function GET() {
  const owner = publicModelConfig();
  const serverGeminiConfigured = isServerGeminiConfigured();
  const agentUrl = process.env.NEXT_PUBLIC_CF_AGENT_URL?.trim() ?? "";
  const agentAuthSecret = process.env.AGENT_AUTH_SECRET ?? "";
  const keylessConfigured = /^https:\/\//.test(agentUrl) && Buffer.byteLength(agentAuthSecret, "utf8") >= 32;
  const byokRequired = !serverGeminiConfigured && isBYOKRequired();
  const readyForRequestCredentials = byokRequired;
  const status = serverGeminiConfigured || owner.configured
    ? "ready"
    : byokRequired
      ? "ready-for-byok"
      : "not-configured";

  return Response.json(
    {
      status,
      byokEnabled: true,
      byokRequired,
      serverGeminiConfigured,
      provider: serverGeminiConfigured ? "gemini" : owner.provider,
      model: serverGeminiConfigured ? GEMINI_SERVER_MODEL : owner.model,
      providerConfigured: serverGeminiConfigured || owner.configured,
      ownerProviderConfigured: serverGeminiConfigured || owner.configured,
      keylessEdge: {
        configured: keylessConfigured,
        status: keylessConfigured ? "configured-not-probed" : "disabled",
        model: "@cf/zai-org/glm-4.7-flash",
      },
      // Readiness does not call a provider or validate a credential.
      credentialsTested: false,
      scope: serverGeminiConfigured
        ? "runtime is ready with server-side Gemini API default and optional BYOK"
        : readyForRequestCredentials
          ? "runtime is ready for client-supplied BYOK credentials; each chat request supplies and tests its own key"
          : "runtime configuration only; run a chat smoke test to verify provider credentials",
    },
    {
      status: serverGeminiConfigured || byokRequired || owner.configured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
