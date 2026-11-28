import "server-only";

import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { dbSchema } from "./schema";

export type PlatformDatabase = PostgresJsDatabase<typeof dbSchema>;
export type PlatformSql = ReturnType<typeof postgres>;

let sqlClient: PlatformSql | null = null;
let databaseClient: PlatformDatabase | null = null;
let databaseUrlForClient: string | null = null;

export function getPlatformSql(): PlatformSql | null {
  const url = process.env.NEON_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!sqlClient || databaseUrlForClient !== url) {
    if (sqlClient) void sqlClient.end({ timeout: 5 }).catch(() => {});
    sqlClient = postgres(url, { prepare: false, max: 3, idle_timeout: 20, ssl: "verify-full" });
    databaseUrlForClient = url;
    databaseClient = null;
  }
  return sqlClient;
}

export function getPlatformDb(): PlatformDatabase | null {
  const sql = getPlatformSql();
  if (!sql) return null;
  return databaseClient ??= drizzle(sql, { schema: dbSchema });
}

export async function resetDatabaseClientsForTests(): Promise<void> {
  const previous = sqlClient;
  sqlClient = null;
  databaseClient = null;
  databaseUrlForClient = null;
  if (previous) await previous.end({ timeout: 0 });
}
