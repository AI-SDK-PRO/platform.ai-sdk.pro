import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@neon/auth/next/server", () => ({
  createNeonAuth: vi.fn(() => ({ managed: true })),
}));
import { createNeonAuth } from "@neon/auth/next/server";
import { getAuth } from "./neon-auth";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("managed Neon configuration", () => {
  it("fails closed without auth configuration", () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    expect(() => getAuth()).toThrow();
    expect(createNeonAuth).not.toHaveBeenCalled();
  });
  it("uses the existing server secret when a dedicated cookie secret is not supplied", () => {
    vi.stubEnv(
      "NEON_AUTH_BASE_URL",
      "https://auth.example.neon.tech/neondb/auth"
    );
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "");
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "test-only-cookie-secret-longer-than-32-characters"
    );
    getAuth();
    expect(createNeonAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://auth.example.neon.tech/neondb/auth",
        cookies: {
          secret: "test-only-cookie-secret-longer-than-32-characters",
          sameSite: "lax",
        },
      })
    );
  });
  it.each([
    "http://auth.example.com/auth",
    "https://user:password@example.com/auth",
  ])("rejects insecure auth URL %s", baseUrl => {
    vi.stubEnv("NEON_AUTH_BASE_URL", baseUrl);
    vi.stubEnv(
      "NEON_AUTH_COOKIE_SECRET",
      "test-only-cookie-secret-longer-than-32-characters"
    );
    expect(() => getAuth()).toThrow();
  });
});
