import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { postgres, drizzle } = vi.hoisted(() => ({
  postgres: vi.fn(),
  drizzle: vi.fn(),
}));
vi.mock("postgres", () => ({ default: postgres }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle }));

import { getPlatformDb, resetDatabaseClientsForTests } from "./client";

beforeEach(async () => {
  await resetDatabaseClientsForTests();
  vi.resetAllMocks();
  vi.stubEnv(
    "SUPABASE_DB_URL",
    "postgres://fixture:fixture@localhost/fixture"
  );
});
afterEach(async () => { await resetDatabaseClientsForTests(); vi.unstubAllEnvs(); });

describe("authentication database persistence", () => {
  it("uses the dedicated Supabase connection string", () => {
    vi.stubEnv(
      "SUPABASE_DB_URL",
      "postgres://fixture:fixture@localhost/integration"
    );
    postgres.mockReturnValue({ end: vi.fn().mockResolvedValue(undefined) });
    drizzle.mockReturnValue({ select: vi.fn() });
    expect(getPlatformDb()).not.toBeNull();
    expect(postgres).toHaveBeenCalledWith(
      "postgres://fixture:fixture@localhost/integration",
      expect.objectContaining({ prepare: false })
    );
  });
  it("returns no database when it is not configured", () => {
    vi.stubEnv("SUPABASE_DB_URL", "");
    expect(getPlatformDb()).toBeNull();
    expect(postgres).not.toHaveBeenCalled();
  });

  it("propagates an invalid connection configuration instead of faking writes", () => {
    postgres.mockImplementation(() => {
      throw new Error("Invalid connection");
    });
    expect(() => getPlatformDb()).toThrow("Invalid connection");
    expect(drizzle).not.toHaveBeenCalled();
  });

  it("does not replace a failed database adapter with a mock", () => {
    postgres.mockReturnValue({ end: vi.fn().mockResolvedValue(undefined) });
    drizzle.mockImplementation(() => {
      throw new Error("Invalid adapter");
    });
    expect(() => getPlatformDb()).toThrow("Invalid adapter");
  });

  it("keeps a failed configuration change from reusing the previous database", () => {
    const database = { select: vi.fn() };
    postgres.mockReturnValue({ end: vi.fn().mockResolvedValue(undefined) });
    drizzle.mockReturnValue(database);
    expect(getPlatformDb()).toBe(database);
    vi.stubEnv("SUPABASE_DB_URL", "invalid");
    postgres.mockImplementation(() => {
      throw new Error("Invalid connection");
    });
    expect(() => getPlatformDb()).toThrow("Invalid connection");
    expect(() => getPlatformDb()).toThrow("Invalid connection");
  });
});
