import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const repoStartersDir = path.resolve(packageDir, "../../starters");
const targetTemplatesDir = path.resolve(packageDir, "templates");

const STARTERS = ["streaming-chat", "docs-assistant", "agent-launchpad"];
const EXCLUDED_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
  ".turbo",
  "dist",
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".DS_Store",
]);

if (!existsSync(repoStartersDir)) {
  throw new Error(`Starters source directory not found: ${repoStartersDir}`);
}

rmSync(targetTemplatesDir, { recursive: true, force: true });
mkdirSync(targetTemplatesDir, { recursive: true });

for (const slug of STARTERS) {
  const source = path.join(repoStartersDir, slug);
  const destination = path.join(targetTemplatesDir, slug);
  if (!existsSync(source)) {
    throw new Error(`Starter "${slug}" is missing at ${source}`);
  }
  cpSync(source, destination, {
    recursive: true,
    filter: entryPath => {
      const base = path.basename(entryPath);
      if (EXCLUDED_NAMES.has(base)) return false;
      if (base.startsWith(".env.") && base !== ".env.example") return false;
      return true;
    },
  });
}

console.log(`Synced ${STARTERS.length} aisdkpro starters into ${targetTemplatesDir}`);
