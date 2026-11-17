# Domain Records — `ai-sdk.pro` & `platform.ai-sdk.pro`

Cloudflare Zone: `ai-sdk.pro` (`c37d07b0fc5c6a804ab0dc0c54746868`)
Authoritative Nameservers: `amanda.ns.cloudflare.com`, `roman.ns.cloudflare.com`

## DNS & Custom Domain Records

| Hostname | Type | Target / Routing | Proxy / SSL | Purpose |
| --- | --- | --- | --- | --- |
| `ai-sdk.pro` | `A` | `167.172.73.127` | Proxied · Full (strict) | Main VPS (`ai-sdk-pro-prod`) |
| `www.ai-sdk.pro` | `CNAME` | `ai-sdk.pro` | Proxied · Full (strict) | 301 redirect to apex |
| `platform.ai-sdk.pro` | `CNAME` / Custom Domain | `aisdkpro-platform-api-staging` (Cloudflare Worker Custom Domain) or `ai-sdk.pro` (VPS Caddy) | Proxied · Full (strict) | Isolated Platform / Deploy Control Plane |
| `deploy-staging.ai-sdk.pro` | Worker Custom Domain | `aisdkpro-platform-api-staging` | Proxied · Full (strict) | Staging Deploy API Worker |

## Environment Mapping for `platform.ai-sdk.pro`

```dotenv
APP_ORIGINS=https://platform.ai-sdk.pro,https://ai-sdk.pro
BETTER_AUTH_URL=https://platform.ai-sdk.pro
PLATFORM_DEPLOY_ORIGIN=https://platform.ai-sdk.pro
```

- `apps/agent-worker/wrangler.jsonc` allows `https://platform.ai-sdk.pro`, `https://ai-sdk.pro`, and `http://localhost:3000`.
- `infra/cloudflare-platform/wrangler.jsonc` registers both `deploy-staging.ai-sdk.pro` and `platform.ai-sdk.pro` under `routes`.
- `infra/production/Caddyfile` serves `ai-sdk.pro` and `platform.ai-sdk.pro` with identical TLS and security headers when hosted via Caddy.
