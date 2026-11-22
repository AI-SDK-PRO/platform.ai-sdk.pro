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

it("uses the browser-bound code exchange for OAuth", async () => {
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  const response = await GET(new Request("https://platform.ai-sdk.pro/api/auth/callback?code=test"));
  expect(response.headers.get("location")).toBe("https://platform.ai-sdk.pro/");
  expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("test");
  expect(mocks.verifySupabaseEmail).not.toHaveBeenCalled();
});
