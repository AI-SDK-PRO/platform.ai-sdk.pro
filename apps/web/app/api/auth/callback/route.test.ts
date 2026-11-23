import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  getSupabaseAuth: vi.fn(),
  verifySupabaseEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/supabase-auth", () => mocks);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSupabaseAuth.mockResolvedValue({
    exchangeCodeForSession: mocks.exchangeCodeForSession,
  });
});

it("confirms an email without establishing a browser session", async () => {
  mocks.verifySupabaseEmail.mockResolvedValue(true);
  const response = await GET(new Request("https://platform.ai-sdk.pro/api/auth/callback?token_hash=test"));
  expect(response.headers.get("location")).toBe("https://platform.ai-sdk.pro/login");
  expect(mocks.verifySupabaseEmail).toHaveBeenCalledWith("test");
  expect(mocks.getSupabaseAuth).not.toHaveBeenCalled();
  expect(response.headers.has("set-cookie")).toBe(false);
});

it("uses the browser-bound code exchange for OAuth and preserves safe next paths", async () => {
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  const response = await GET(
    new Request("https://platform.ai-sdk.pro/api/auth/callback?code=test&next=%2Fworkspace")
  );
  expect(response.headers.get("location")).toBe("https://platform.ai-sdk.pro/workspace");
  expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("test");
  expect(mocks.verifySupabaseEmail).not.toHaveBeenCalled();

  const unsafe = await GET(
    new Request("https://platform.ai-sdk.pro/api/auth/callback?code=test&next=%2F%2Fevil.example")
  );
  expect(unsafe.headers.get("location")).toBe("https://platform.ai-sdk.pro/");
});

it("supports both token_hash and PKCE code on password recovery", async () => {
  const { GET: getRecovery } = await import("../recovery/route");

  const tokenHashRes = await getRecovery(
    new Request("https://platform.ai-sdk.pro/api/auth/recovery?token_hash=recovery-hash")
  );
  expect(tokenHashRes.headers.get("location")).toBe(
    "https://platform.ai-sdk.pro/reset-password?token=recovery-hash"
  );

  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  const pkceRes = await getRecovery(
    new Request("https://platform.ai-sdk.pro/api/auth/recovery?code=pkce-recovery-code")
  );
  expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("pkce-recovery-code");
  expect(pkceRes.headers.get("location")).toBe(
    "https://platform.ai-sdk.pro/reset-password?token=session"
  );
});

