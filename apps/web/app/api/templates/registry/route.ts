import { starterTemplates } from "@/lib/starter-catalog";
import { SITE_ORIGIN } from "@/lib/seo-metadata";

export const dynamic = "force-static";

export function GET() {
  const origin = process.env.PLATFORM_DEPLOY_ORIGIN?.trim() || SITE_ORIGIN;
  return Response.json(
    {
      registry: "aisdkpro",
      cliPackage: "create-webapp",
      command: "npx create-webapp@latest aisdkpro",
      origin,
      templates: starterTemplates.map(template => ({
        slug: template.slug,
        title: template.title,
        tagline: template.tagline,
        description: template.description,
        category: template.category,
        framework: template.framework,
        features: template.features,
        requirements: template.requirements,
        setup: template.setup,
        cliCommand: `npx create-webapp@latest aisdkpro --template ${template.slug}`,
        downloadUrl: `${origin}${template.downloadUrl}`,
        fileCount: template.fileCount,
        bytes: template.bytes,
        sha256: template.sha256,
      })),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
