import { describe, expect, it } from "vitest";

import { authErrorCode, describeAuthError } from "./auth-error-messages";

describe("describeAuthError", () => {
  it("explains the GitHub private-email failure that lands on /login?error=email_not_found", () => {
    const message = describeAuthError("email_not_found");
    expect(message).toContain("อีเมล");
    expect(message).toContain("GitHub");
  });

  it("is case and whitespace insensitive", () => {
    expect(describeAuthError("  EMAIL_NOT_FOUND ")).toBe(
      describeAuthError("email_not_found")
    );
  });

  it("explains a blocking Neon Auth webhook", () => {
    expect(describeAuthError("WEBHOOK_DELIVERY_FAILED")).toContain("webhook");
  });

  it("returns null when there is no code so no banner is rendered", () => {
    expect(describeAuthError(null)).toBeNull();
    expect(describeAuthError("")).toBeNull();
    expect(describeAuthError(undefined)).toBeNull();
  });

  it("still surfaces unknown codes instead of hiding them", () => {
    expect(describeAuthError("something_new")).toContain("something_new");
  });
});

describe("authErrorCode", () => {
  it("reads the Better Auth client error code", () => {
    expect(authErrorCode({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "INVALID_EMAIL_OR_PASSWORD"
    );
  });

  it("ignores values without a usable code", () => {
    expect(authErrorCode(null)).toBeNull();
    expect(authErrorCode(new Error("boom"))).toBeNull();
    expect(authErrorCode({ code: "   " })).toBeNull();
  });
});
