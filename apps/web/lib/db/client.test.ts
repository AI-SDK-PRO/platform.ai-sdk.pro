import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { neon, drizzle } = vi.hoisted(() => ({
  neon: vi.fn(),
  drizzle: vi.fn(),
}));
vi.mock("@neondatabase/serverless", () => ({ neon }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle }));

import { getPlatformDb, resetDatabaseClientsForTests } from "./client";

beforeEach(() => {
  vi.resetAllMocks();
  resetDatabaseClientsForTests();
  vi.stubEnv(
    "NEON_DATABASE_URL",
    "postgres://fixture:fixture@localhost/fixture"
  );
});
afterEach(() => vi.unstubAllEnvs());

describe("authentication database persistence", () => {
  it("accepts the standard Vercel Neon integration DATABASE_URL", () => {
    vi.stubEnv("NEON_DATABASE_URL", "");
    vi.stubEnv(
      "DATABASE_URL",
      "postgres://fixture:fixture@localhost/integration"
    );
    neon.mockReturnValue(() => []);
    drizzle.mockReturnValue({ select: vi.fn() });
    expect(getPlatformDb()).not.toBeNull();
    expect(neon).toHaveBeenCalledWith(
      "postgres://fixture:fixture@localhost/integration"
    );
  });
  it("returns no database when it is not configured", () => {
    vi.stubEnv("NEON_DATABASE_URL", "");
    expect(getPlatformDb()).toBeNull();
    expect(neon).not.toHaveBeenCalled();
  });

  it("propagates an invalid connection configuration instead of faking writes", () => {
    neon.mockImplementation(() => {
      throw new Error("Invalid connection");
    });
    expect(() => getPlatformDb()).toThrow("Invalid connection");
    expect(drizzle).not.toHaveBeenCalled();
  });

  it("does not replace a failed database adapter with a mock", () => {
    neon.mockReturnValue(() => []);
    drizzle.mockImplementation(() => {
      throw new Error("Invalid adapter");
    });
    expect(() => getPlatformDb()).toThrow("Invalid adapter");
  });

  it("keeps a failed configuration change from reusing the previous database", () => {
    const database = { select: vi.fn() };
    neon.mockReturnValue(() => []);
    drizzle.mockReturnValue(database);
    expect(getPlatformDb()).toBe(database);
    vi.stubEnv("NEON_DATABASE_URL", "invalid");
    neon.mockImplementation(() => {
      throw new Error("Invalid connection");
    });
    expect(() => getPlatformDb()).toThrow("Invalid connection");
    expect(() => getPlatformDb()).toThrow("Invalid connection");
  });
});
