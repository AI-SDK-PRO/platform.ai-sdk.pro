import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Keep the existing Next.js App Router, route handlers and SSR behavior.
// The Cloudflare adapter produces .open-next/worker.js and static assets.
export default defineCloudflareConfig();
