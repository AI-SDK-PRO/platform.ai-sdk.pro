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
    vi.stubEnv("SUPABASE_DB_URL", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("GITHUB_CLIENT_ID", "");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    vi.stubEnv("GITHUB_APP_SLUG", "");
    expect(getPlatformConfig().configured).toBe(false);
    expect(platformStatus().missingConfiguration).toEqual(
      expect.arrayContaining([
        "SUPABASE_DB_URL",
        "BETTER_AUTH_SECRET",
        "NEXT_PUBLIC_SUPABASE_URL",
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

  it("enables Supabase email registration when platform config is ready unless explicitly disabled", () => {
    vi.stubEnv("SUPABASE_DB_URL", "postgres://unit-test");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-0123456789abcdef0123");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture");
    vi.stubEnv("GITHUB_CLIENT_ID", "");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    expect(getPlatformConfig().configured).toBe(true);
    expect(getPlatformConfig().githubConfigured).toBe(false);
    expect(getPlatformConfig().emailRegistrationAvailable).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(getPlatformConfig().emailRegistrationAvailable).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture");
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
    expect(
      isTrustedMutationOrigin(
        new Request("http://0.0.0.0:3000/api/auth/sign-in/email", {
          headers: { Origin: "http://127.0.0.1:3000" },
        })
      )
    ).toBe(true);
    expect(
      isTrustedMutationOrigin(
        new Request("http://0.0.0.0:3000/api/auth/sign-in/email", {
          headers: { Origin: "http://127.0.0.1:9999" },
        })
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

  it("flags non-postgres SUPABASE_DB_URL and trusts DOMAIN/PLATFORM_DOMAIN origins", async () => {
    vi.stubEnv("SUPABASE_DB_URL", "https://not-a-postgres-url.example");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-0123456789abcdef0123");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture");
    expect(platformStatus().configured).toBe(false);
    expect(platformStatus().missingConfiguration).toContain("SUPABASE_DB_URL");

    const { trustedPlatformOrigins } = await import("./platform-policy");
    vi.stubEnv("DOMAIN", "custom-vps.example");
    vi.stubEnv("PLATFORM_DOMAIN", "platform.custom-vps.example");
    expect(trustedPlatformOrigins()).toEqual(
      expect.arrayContaining([
        "https://custom-vps.example",
        "https://platform.custom-vps.example",
      ])
    );
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

