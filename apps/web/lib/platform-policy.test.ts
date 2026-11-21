import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getPlatformConfig,
  isTrustedMutationOrigin,
  PlatformAuthenticationError,
  platformStatus,
  resolvePublicOrigin,
  safePlatformError,
} from "./platform-policy";

afterEach(() => vi.unstubAllEnvs());

describe("platform configuration", () => {
  it("reports setup-required variables without opening a database", () => {
    vi.stubEnv("NEON_DATABASE_URL", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("GITHUB_CLIENT_ID", "");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    vi.stubEnv("GITHUB_APP_SLUG", "");
    expect(getPlatformConfig().configured).toBe(false);
    expect(platformStatus().missingConfiguration).toEqual(
      expect.arrayContaining([
        "NEON_DATABASE_URL / DATABASE_URL",
        "NEON_AUTH_COOKIE_SECRET / BETTER_AUTH_SECRET",
        "NEON_AUTH_BASE_URL",
      ])
    );
    expect(platformStatus().githubConfigured).toBe(false);
    expect(platformStatus().emailRegistrationAvailable).toBe(false);
    expect(platformStatus().missingConfiguration).not.toContain(
      "GITHUB_CLIENT_ID"
    );
    expect(platformStatus().githubAppInstallUrl).toBe(
      "https://github.com/apps/ai-sdk-pro/installations/new"
    );
  });

  it("enables Neon email registration when platform config is ready unless explicitly disabled", () => {
    vi.stubEnv("NEON_DATABASE_URL", "postgres://unit-test");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-0123456789abcdef0123");
    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.neon.tech/auth");
    vi.stubEnv("GITHUB_CLIENT_ID", "");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    expect(getPlatformConfig().configured).toBe(true);
    expect(getPlatformConfig().githubConfigured).toBe(false);
    expect(getPlatformConfig().emailRegistrationAvailable).toBe(true);

    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    expect(getPlatformConfig().emailRegistrationAvailable).toBe(false);

    vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.neon.tech/auth");
    vi.stubEnv("PLATFORM_EMAIL_AUTH_ENABLED", "false");
    expect(getPlatformConfig().emailRegistrationAvailable).toBe(false);
  });

  it("only accepts trusted ai-sdk.pro origins for mutations and rejects cross-site or missing Origin", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://ai-sdk.pro");
    expect(
      isTrustedMutationOrigin(
        new Request("https://ai-sdk.pro/api/repositories", {
          headers: { Origin: "https://ai-sdk.pro" },
        })
      )
    ).toBe(true);
    expect(
      isTrustedMutationOrigin(
        new Request("https://platform.ai-sdk.pro/api/auth/firebase-session", {
          headers: { Origin: "https://platform.ai-sdk.pro" },
        })
      )
    ).toBe(true);
    expect(
      isTrustedMutationOrigin(
        new Request("https://ai-sdk.pro/api/repositories", {
          headers: { Origin: "https://evil.example" },
        })
      )
    ).toBe(false);
    expect(
      isTrustedMutationOrigin(
        new Request("https://ai-sdk.pro/api/repositories")
      )
    ).toBe(false);
  });

  it("resolves trusted public request origin for OAuth callbacks without trusting evil hosts", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://ai-sdk.pro");
    vi.stubEnv("TRUST_PROXY", "true");
    const platformReq = new Request(
      "https://ai-sdk.pro/api/connections/github",
      {
        headers: {
          "x-forwarded-host": "platform.ai-sdk.pro",
          "x-forwarded-proto": "https",
        },
      }
    );
    expect(resolvePublicOrigin(platformReq)).toBe(
      "https://platform.ai-sdk.pro"
    );

    const evilReq = new Request("https://ai-sdk.pro/api/connections/github", {
      headers: {
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(resolvePublicOrigin(evilReq)).toBe("https://ai-sdk.pro");
  });

  it("preserves safe PlatformAuthenticationError messages while redacting sensitive strings", () => {
    expect(
      safePlatformError(
        new PlatformAuthenticationError(
          "Verify your Firebase email before signing in."
        )
      )
    ).toEqual({
      message: "Verify your Firebase email before signing in.",
      status: 401,
    });
    expect(
      safePlatformError(
        new PlatformAuthenticationError("postgres://leaked-secret")
      )
    ).toEqual({
      message: "Authentication is required.",
      status: 401,
    });
  });
});
