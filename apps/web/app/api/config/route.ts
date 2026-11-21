import { isBYOKRequired, isServerGeminiConfigured, publicBYOKProviders } from "@/lib/byok-policy";
import { GEMINI_SERVER_MODEL } from "@/lib/gemini-agent";
import { publicModelConfig } from "@/lib/provider";

export const dynamic = "force-dynamic";

export function GET() {
  const owner = publicModelConfig();
  const serverGeminiConfigured = isServerGeminiConfigured();
  const byokRequired = !serverGeminiConfigured && isBYOKRequired();
  return Response.json(
    {
      byokEnabled: true,
      byokRequired,
      serverGeminiConfigured,
      defaultMode: serverGeminiConfigured ? "gemini" : "byok",
      providers: publicBYOKProviders(),
      // Keep owner/server configuration observable separately from BYOK state.
      provider: serverGeminiConfigured ? "gemini" : owner.provider,
      model: serverGeminiConfigured ? GEMINI_SERVER_MODEL : owner.model,
      configured: serverGeminiConfigured || owner.configured,
      providerConfigured: serverGeminiConfigured || owner.configured,
      ownerProviderConfigured: serverGeminiConfigured || owner.configured,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
