import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { handleNeonAuthEvent, verifyNeonAuthSignature } from "./neon-auth-webhook";

describe("Neon Auth webhook events", () => {
  it("allows sign-up for the blocking user.before_create event", () => {
    expect(handleNeonAuthEvent({ event_type: "user.before_create" })).toEqual({
      status: 200,
      body: { allowed: true },
    });
  });

  it("acknowledges non-blocking events without a body", () => {
    expect(handleNeonAuthEvent({ event_type: "user.created" })).toEqual({
      status: 200,
      body: null,
    });
  });
});

describe("Neon Auth webhook signature", () => {
  it("rejects requests without signature headers", async () => {
    await expect(
      verifyNeonAuthSignature("{}", new Headers())
    ).resolves.toBe(false);
  });

  it("rejects a detached JWS that is not in the documented format", async () => {
    const headers = new Headers({
      "x-neon-signature": "not-a-jws",
      "x-neon-timestamp": String(Date.now()),
    });
    await expect(verifyNeonAuthSignature("{}", headers)).resolves.toBe(false);
  });

  it("rejects a stale timestamp before touching the network", async () => {
    const headers = new Headers({
      "x-neon-signature": "a..b",
      "x-neon-timestamp": String(Date.now() - 60 * 60 * 1000),
    });
    await expect(verifyNeonAuthSignature("{}", headers)).resolves.toBe(false);
  });
});
