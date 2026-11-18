export const SITE_INFO = {
  name: "ai-sdk.pro",
  origin: "https://ai-sdk.pro",
  platformOrigin: "https://platform.ai-sdk.pro",
  contactEmail: "sdkbank@1origin.dev",
  devstackOrigin: "https://devstack.bid",
  devstackRepository: "https://github.com/developer-devstack/devstack.bid",
  devstackPackage: "https://www.npmjs.com/package/devstack-bid",
  /** npm CLI package in monorepo `packages/create-webapp` — publish before public `npx` works */
  cliPackageName: "create-webapp",
  cliScaffoldCommand: "npx create-webapp@latest aisdkpro",
  cliTemplateCommand: (slug: string) =>
    `npx create-webapp@latest aisdkpro --template ${slug}`,
} as const;
