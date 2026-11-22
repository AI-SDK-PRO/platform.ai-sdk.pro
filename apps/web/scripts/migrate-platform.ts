import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres from "postgres";

async function main(): Promise<void> {
  const databaseUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!databaseUrl) {
    console.error("SUPABASE_DB_URL is required for platform:migrate.");
    process.exitCode = 1;
    return;
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: "verify-full" });
  try {
    for (const name of ["0001_platform.sql", "0006_platform_tokens.sql", "0007_deployment_intake.sql", "0008_preview_dispatch.sql", "0009_workspace_data.sql", "0010_supabase_identity.sql"]) {
      const migrationPath = resolve(__dirname, "..", "migrations", name);
      const migration = await readFile(migrationPath, "utf8");
      await sql.begin(tx => tx.unsafe(migration).simple());
      console.log(`Applied platform migration ${name}.`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch(() => {
  console.error("Platform migration failed.");
  process.exitCode = 1;
});
