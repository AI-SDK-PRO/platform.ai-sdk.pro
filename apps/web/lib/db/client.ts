import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import { dbSchema } from "./schema";

export type PlatformDatabase = NeonHttpDatabase<typeof dbSchema>;
export type PlatformSql = ReturnType<typeof neon>;

let sqlClient: PlatformSql | null = null;
let databaseClient: PlatformDatabase | null = null;
let databaseUrlForClient: string | null = null;

function createMockSql(): PlatformSql {
  const mockSql = (async () => []) as unknown as PlatformSql;
  (mockSql as unknown as { transaction: (fn: (tx: PlatformSql) => unknown[]) => Promise<unknown[]> }).transaction =
    async () => [];
  return mockSql;
}

function createMockDb(): PlatformDatabase {
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: { data?: unknown }) => d?.data ?? {},
    update: async (d: { data?: unknown }) => d?.data ?? {},
    delete: async () => ({}),
  };
  return new Proxy({} as PlatformDatabase, {
    get: (_, prop) => {
      if (prop === "query") return new Proxy({}, { get: () => noOp });
      if (prop === "select" || prop === "insert" || prop === "update" || prop === "delete") {
        const chain: Record<string, unknown> = {};
        const resolver = Promise.resolve([]);
        const proxyChain: unknown = new Proxy(chain, {
          get: (_target, key) => {
            if (key === "then") return resolver.then.bind(resolver);
            if (key === "catch") return resolver.catch.bind(resolver);
            return () => proxyChain;
          },
        });
        return () => proxyChain;
      }
      if (prop === "batch") return async () => [];
      return async () => [];
    },
  });
}

export function getNeonDatabaseUrl(): string | null {
  const value = process.env.NEON_DATABASE_URL?.trim();
  return value ? value : null;
}

export function getNeonSql(): PlatformSql | null {
  const url = getNeonDatabaseUrl();
  if (!url) return null;
  if (!sqlClient || databaseUrlForClient !== url) {
    try {
      sqlClient = neon(url);
    } catch {
      console.warn("[AI Studio] Database not connected — using mock");
      sqlClient = createMockSql();
    }
    databaseUrlForClient = url;
    databaseClient = null;
  }
  return sqlClient;
}

export function getPlatformDb(): PlatformDatabase | null {
  const sql = getNeonSql();
  if (!sql) return null;
  if (!databaseClient) {
    try {
      databaseClient = drizzle(sql, { schema: dbSchema, logger: false });
    } catch {
      console.warn("[AI Studio] Database not connected — using mock");
      databaseClient = createMockDb();
    }
  }
  return databaseClient;
}

export function resetDatabaseClientsForTests(): void {
  sqlClient = null;
  databaseClient = null;
  databaseUrlForClient = null;
}
