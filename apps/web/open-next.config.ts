import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Keep the current Next.js App Router/runtime. Configure cache bindings only
// after the application passes a Cloudflare Worker preview smoke test.
export default defineCloudflareConfig();
