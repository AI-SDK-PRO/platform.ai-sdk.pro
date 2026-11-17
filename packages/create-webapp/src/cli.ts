#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";
import {
  AISDKPRO_TEMPLATES,
  fetchRemoteRegistry,
  isValidTemplateSlug,
  parseCliArgs,
  scaffoldTemplate,
  type StarterDescriptor,
  type TemplateSlug,
} from "./index";

function printHelp() {
  console.log(`
create-webapp (ai-sdk.pro registry)

Usage:
  npx create-webapp@latest aisdkpro [project-dir] [options]
  npx create-webapp@latest aisdkpro --template <slug> [project-dir]

Templates:
  streaming-chat   Next.js · AI SDK 6 streaming chat starter (BYOK)
  docs-assistant   Next.js · AI SDK 6 local documentation search starter
  agent-launchpad  Static HTML · Node.js landing & tool directory starter

Options:
  -t, --template <slug>  Starter template slug
  -d, --dir <path>       Target directory inside workspace
  -l, --list             List available aisdkpro starters
  -y, --yes              Skip interactive prompts and use defaults
  -f, --force            Overwrite files if target directory is not empty
      --registry <url>   Optional custom registry endpoint URL
  -h, --help             Show this help message
`);
}

function printTemplates(templates: readonly StarterDescriptor[]) {
  console.log("\nai-sdk.pro starter registry:\n");
  templates.forEach((item, index) => {
    console.log(`  ${index + 1}. ${item.slug.padEnd(16)} ${item.framework} — ${item.summary}`);
  });
  console.log("");
}

async function promptForSelections(
  templates: readonly StarterDescriptor[],
  initialTemplate: TemplateSlug | null,
  initialDir: string | null
): Promise<{ template: TemplateSlug; targetDir: string }> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    let selectedTemplate = initialTemplate;
    if (!selectedTemplate) {
      printTemplates(templates);
      const answer = (
        await rl.question("Select template [1-3 or slug] (default: streaming-chat): ")
      ).trim();
      if (!answer) {
        selectedTemplate = "streaming-chat";
      } else if (/^[1-9]\d*$/.test(answer)) {
        const picked = templates[Number(answer) - 1];
        if (!picked) throw new Error(`Invalid template index: ${answer}`);
        selectedTemplate = picked.slug;
      } else if (isValidTemplateSlug(answer)) {
        selectedTemplate = answer;
      } else {
        throw new Error(`Unknown template: ${answer}`);
      }
    }

    let chosenDir = initialDir;
    if (!chosenDir) {
      const defaultDir = selectedTemplate;
      const answer = (
        await rl.question(`Project folder (default: ${defaultDir}): `)
      ).trim();
      chosenDir = answer || defaultDir;
    }

    return { template: selectedTemplate, targetDir: chosenDir };
  } finally {
    rl.close();
  }
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }

  let catalog: StarterDescriptor[] = [...AISDKPRO_TEMPLATES];
  if (parsed.registryUrl) {
    catalog = await fetchRemoteRegistry(parsed.registryUrl);
  }

  if (parsed.list) {
    printTemplates(catalog);
    return;
  }

  const interactive = Boolean(stdin.isTTY && stdout.isTTY && !parsed.yes);
  let template: TemplateSlug = parsed.template ?? "streaming-chat";
  let targetDir: string = parsed.targetDir ?? template;

  if (interactive && (!parsed.template || !parsed.targetDir)) {
    const picked = await promptForSelections(catalog, parsed.template, parsed.targetDir);
    template = picked.template;
    targetDir = picked.targetDir;
  }

  const result = scaffoldTemplate({
    template,
    targetDir,
    force: parsed.force,
  });

  const rel = path.relative(process.cwd(), result.destination) || ".";
  console.log(`\nCreated "${result.projectName}" (${result.template}, ${result.fileCount} files) in ${rel}\n`);
  console.log("Next steps:");
  console.log(`  cd ${rel}`);
  console.log("  cp .env.example .env");
  console.log("  npm install");
  console.log("  npm run dev\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
