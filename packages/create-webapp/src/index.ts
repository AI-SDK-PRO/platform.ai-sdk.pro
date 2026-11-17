import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type TemplateSlug =
  | "streaming-chat"
  | "docs-assistant"
  | "agent-launchpad";

export interface StarterDescriptor {
  slug: TemplateSlug;
  title: string;
  framework: string;
  summary: string;
}

export const AISDKPRO_TEMPLATES: readonly StarterDescriptor[] = [
  {
    slug: "streaming-chat",
    title: "Streaming Chat",
    framework: "Next.js · AI SDK 6",
    summary: "Real UI message streaming chat with OpenAI BYOK, time tool, and stop generation.",
  },
  {
    slug: "docs-assistant",
    title: "Docs Assistant",
    framework: "Next.js · AI SDK 6",
    summary: "Bounded local knowledge search assistant with source references and BYOK.",
  },
  {
    slug: "agent-launchpad",
    title: "Agent Launchpad",
    framework: "Static HTML · Node.js",
    summary: "Editable static site starter with copyable tool links and zero AI key dependencies.",
  },
] as const;

export interface ParsedCliArgs {
  preset: string | null;
  template: TemplateSlug | null;
  targetDir: string | null;
  list: boolean;
  yes: boolean;
  force: boolean;
  help: boolean;
  registryUrl: string | null;
}

export interface ScaffoldOptions {
  template: TemplateSlug;
  targetDir: string;
  cwd?: string;
  templatesRoot?: string;
  force?: boolean;
}

export interface ScaffoldResult {
  template: TemplateSlug;
  projectName: string;
  destination: string;
  fileCount: number;
}

const VALID_SLUGS = new Set<string>(AISDKPRO_TEMPLATES.map(item => item.slug));
const EXCLUDED_FILES = new Set([
  "node_modules",
  ".next",
  ".git",
  ".turbo",
  "dist",
  ".env",
  ".env.local",
  ".DS_Store",
]);

export function isValidTemplateSlug(value: string): value is TemplateSlug {
  return VALID_SLUGS.has(value);
}

export function defaultTemplatesRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const bundled = path.resolve(here, "../templates");
  if (existsSync(bundled)) return bundled;
  const monorepoStarters = path.resolve(here, "../../../starters");
  if (existsSync(monorepoStarters)) return monorepoStarters;
  return bundled;
}

export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  let preset: string | null = null;
  let template: TemplateSlug | null = null;
  let targetDir: string | null = null;
  let list = false;
  let yes = false;
  let force = false;
  let help = false;
  let registryUrl: string | null = null;

  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--list" || arg === "-l") {
      list = true;
    } else if (arg === "--yes" || arg === "-y") {
      yes = true;
    } else if (arg === "--force" || arg === "-f") {
      force = true;
    } else if (arg === "--template" || arg === "-t") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value for --template.");
      if (!isValidTemplateSlug(next)) {
        throw new Error(`Unknown template "${next}". Available: ${[...VALID_SLUGS].join(", ")}`);
      }
      template = next;
      i += 1;
    } else if (arg.startsWith("--template=")) {
      const value = arg.slice("--template=".length);
      if (!isValidTemplateSlug(value)) {
        throw new Error(`Unknown template "${value}". Available: ${[...VALID_SLUGS].join(", ")}`);
      }
      template = value;
    } else if (arg === "--dir" || arg === "-d") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value for --dir.");
      targetDir = next;
      i += 1;
    } else if (arg.startsWith("--dir=")) {
      targetDir = arg.slice("--dir=".length);
    } else if (arg === "--registry") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value for --registry.");
      registryUrl = next;
      i += 1;
    } else if (arg.startsWith("--registry=")) {
      registryUrl = arg.slice("--registry=".length);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  for (const token of positionals) {
    if (!preset && token === "aisdkpro") {
      preset = "aisdkpro";
      continue;
    }
    if (!template && isValidTemplateSlug(token)) {
      template = token;
      continue;
    }
    if (!targetDir) {
      targetDir = token;
      continue;
    }
    throw new Error(`Unexpected argument: ${token}`);
  }

  return {
    preset,
    template,
    targetDir,
    list,
    yes,
    force,
    help,
    registryUrl,
  };
}

export function sanitizeProjectDir(input: string, cwd = process.cwd()): {
  destination: string;
  projectName: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Target directory name cannot be empty.");
  }
  if (path.isAbsolute(trimmed)) {
    throw new Error("Please pass a relative project directory name inside your workspace.");
  }
  const resolvedBase = path.resolve(cwd);
  const destination = path.resolve(resolvedBase, trimmed);
  const relative = path.relative(resolvedBase, destination);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error("Target directory must stay within the current working directory.");
  }
  const rawName = path.basename(destination).toLowerCase();
  const projectName =
    rawName.replace(/[^a-z0-9._-]+/g, "-").replace(/^[._-]+|-+$/g, "") || "aisdkpro-app";
  return { destination, projectName };
}

function countFiles(root: string): number {
  let count = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(full);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

export function scaffoldTemplate(options: ScaffoldOptions): ScaffoldResult {
  const cwd = options.cwd ?? process.cwd();
  const templatesRoot = options.templatesRoot ?? defaultTemplatesRoot();
  const sourceDir = path.join(templatesRoot, options.template);

  if (!existsSync(sourceDir)) {
    throw new Error(`Template source not found for "${options.template}" at ${sourceDir}`);
  }

  const { destination, projectName } = sanitizeProjectDir(options.targetDir, cwd);

  if (existsSync(destination)) {
    const existingEntries = readdirSync(destination);
    if (existingEntries.length > 0 && !options.force) {
      throw new Error(
        `Directory "${options.targetDir}" already exists and is not empty. Pass --force or choose another folder.`
      );
    }
  } else {
    mkdirSync(destination, { recursive: true });
  }

  cpSync(sourceDir, destination, {
    recursive: true,
    force: Boolean(options.force),
    filter: entryPath => {
      const base = path.basename(entryPath);
      if (EXCLUDED_FILES.has(base)) return false;
      if (base.startsWith(".env.") && base !== ".env.example") return false;
      return true;
    },
  });

  const pkgPath = path.join(destination, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
    pkg.name = projectName;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  }

  return {
    template: options.template,
    projectName,
    destination,
    fileCount: countFiles(destination),
  };
}

export async function fetchRemoteRegistry(
  registryUrl = "https://platform.ai-sdk.pro/api/templates/registry"
): Promise<StarterDescriptor[]> {
  const parsed = new URL(registryUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Registry URL must use http or https.");
  }
  const response = await fetch(parsed.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Registry responded with HTTP ${response.status}`);
  }
  const body = (await response.json()) as {
    templates?: Array<{
      slug?: string;
      title?: string;
      framework?: string;
      description?: string;
      tagline?: string;
    }>;
  };
  if (!Array.isArray(body.templates)) {
    return [...AISDKPRO_TEMPLATES];
  }
  const validated: StarterDescriptor[] = [];
  for (const item of body.templates) {
    if (item.slug && isValidTemplateSlug(item.slug)) {
      validated.push({
        slug: item.slug,
        title: typeof item.title === "string" ? item.title : item.slug,
        framework: typeof item.framework === "string" ? item.framework : "Next.js",
        summary: typeof item.tagline === "string" ? item.tagline : item.description || "",
      });
    }
  }
  return validated.length > 0 ? validated : [...AISDKPRO_TEMPLATES];
}
