import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  AISDKPRO_TEMPLATES,
  parseCliArgs,
  sanitizeProjectDir,
  scaffoldTemplate,
} from "../src/index";

const tempDirs: string[] = [];
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const startersDir = path.resolve(packageDir, "../../starters");

function makeTempWorkspace(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "create-webapp-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("create-webapp aisdkpro CLI", () => {
  it("parses npx create-webapp@latest aisdkpro invocations", () => {
    const basic = parseCliArgs(["aisdkpro"]);
    expect(basic.preset).toBe("aisdkpro");
    expect(basic.template).toBeNull();

    const full = parseCliArgs(["aisdkpro", "--template", "docs-assistant", "my-docs", "--yes"]);
    expect(full.preset).toBe("aisdkpro");
    expect(full.template).toBe("docs-assistant");
    expect(full.targetDir).toBe("my-docs");
    expect(full.yes).toBe(true);
  });

  it("rejects path traversal and absolute target paths", () => {
    const ws = makeTempWorkspace();
    expect(() => sanitizeProjectDir("../outside", ws)).toThrow();
    expect(() => sanitizeProjectDir("/tmp/absolute", ws)).toThrow();
    expect(sanitizeProjectDir("my-ai-app", ws).projectName).toBe("my-ai-app");
  });

  it("scaffolds all 3 starters cleanly with .env.example and zero secret files", () => {
    const ws = makeTempWorkspace();
    for (const descriptor of AISDKPRO_TEMPLATES) {
      const target = `app-${descriptor.slug}`;
      const result = scaffoldTemplate({
        template: descriptor.slug,
        targetDir: target,
        cwd: ws,
        templatesRoot: startersDir,
      });
      expect(result.fileCount).toBeGreaterThan(2);
      expect(existsSync(path.join(result.destination, "package.json"))).toBe(true);
      expect(existsSync(path.join(result.destination, ".env"))).toBe(false);
      const pkg = JSON.parse(
        readFileSync(path.join(result.destination, "package.json"), "utf8")
      ) as { name: string };
      expect(pkg.name).toBe(target);
    }
  });

  it("refuses to overwrite non-empty directories unless --force is passed", () => {
    const ws = makeTempWorkspace();
    const existing = path.join(ws, "occupied");
    const result = scaffoldTemplate({
      template: "agent-launchpad",
      targetDir: "occupied",
      cwd: ws,
      templatesRoot: startersDir,
    });
    expect(result.destination).toBe(existing);
    writeFileSync(path.join(existing, "extra.txt"), "keep", "utf8");
    expect(() =>
      scaffoldTemplate({
        template: "agent-launchpad",
        targetDir: "occupied",
        cwd: ws,
        templatesRoot: startersDir,
      })
    ).toThrow();
  });
});
