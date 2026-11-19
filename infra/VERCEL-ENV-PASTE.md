# วางค่าใน Vercel อย่างรวดเร็ว

ใน Vercel: **Project → Settings → Environment Variables**  
ติ๊ก **Production** และ **Preview** สำหรับทุกตัว (ยกเว้นที่ระบุ)

แทน `https://YOUR-PROJECT.vercel.app` ด้วย URL จริงจากแท็บ Domains

| Key | Value | หมายเหตุ |
| --- | --- | --- |
| `BETTER_AUTH_URL` | `https://YOUR-PROJECT.vercel.app` | ไม่มี slash ท้าย |
| `APP_ORIGINS` | `https://YOUR-PROJECT.vercel.app` | เหมือน URL ด้านบน (ถ้ามีโดเมนเพิ่ม คั่นด้วย comma) |
| `BETTER_AUTH_SECRET` | *(สร้างเอง)* | รัน `openssl rand -base64 32` แล้ววาง |
| `NEON_DATABASE_URL` | `postgresql://...` | จาก Neon Console → Connection string |
| `TRUST_PROXY` | `true` | จำเป็นสำหรับ rate limit ต่อ IP |
| `BYOK_ONLY` | `true` | production |
| `GITHUB_CLIENT_ID` | *(จาก GitHub OAuth App)* | |
| `GITHUB_CLIENT_SECRET` | *(จาก GitHub OAuth App)* | Sensitve |
| `GITHUB_APP_SLUG` | `ai-sdk-pro` | หรือชื่อ App ของคุณ |
| `NEXT_PUBLIC_FIREBASE_EMAIL_AUTH_ENABLED` | `true` | ต้องมีก่อน build — Redeploy หลังเพิ่ม |

**GitHub OAuth callback:** `https://YOUR-PROJECT.vercel.app/api/auth/callback/github`

**Firebase Console → Authorized domains:** เพิ่ม `YOUR-PROJECT.vercel.app` (ไม่ต้องมี `https://`)

หลังใส่ครบ: **Deployments → Redeploy** (ไม่ใช่แค่ env อย่างเดียวสำหรับ `NEXT_PUBLIC_*`)

Migration Neon (ครั้งเดียว บนเครื่องคุณ):

```bash
export NEON_DATABASE_URL='postgresql://...'
pnpm install
pnpm --filter @aisdkpro/web platform:migrate
```

Smoke:

```bash
curl -fsS "https://YOUR-PROJECT.vercel.app/api/health"
curl -fsS "https://YOUR-PROJECT.vercel.app/api/ready"
```