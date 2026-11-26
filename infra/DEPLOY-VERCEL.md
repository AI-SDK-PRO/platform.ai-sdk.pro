# Deploy บน Vercel (ไม่ใช้ VPS)

คู่มือนี้ใช้เมื่อต้องการ **import Git repository แล้ว deploy อัตโนมัติ** โดยไม่เช่า VPS/Coolify/SSH

สแต็กที่แนะนำ (โควต้าฟรีระดับ hobby):

| บริการ | หน้าที่ |
| --- | --- |
| **Vercel Hobby** | โฮสต์ Next.js (`apps/web` + `apps/docs` ผ่าน [`vercel.json`](../vercel.json)) |
| **Neon PostgreSQL** | ฐานข้อมูล Workspace และ Better Auth |

ล็อกอินด้วย Google ผ่าน Better Auth ส่วน GitHub OAuth ใช้เชื่อม Repository แยก

---

## 1. เตรียม Neon และ Better Auth

ตั้งค่า `NEON_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID` และ `GOOGLE_CLIENT_SECRET` โดยใช้ฐานข้อมูล Neon ที่มีตารางใน schema `aisdk_pro` แล้ว รัน `npm run platform:migrate --workspace=apps/web` หากยังไม่ได้ใช้ migrations

## 2. Import repository ใน Vercel

1. [Vercel Dashboard](https://vercel.com) → **Add New… → Project**
2. เลือก GitHub repository ของ monorepo นี้
3. Vercel อ่าน [`vercel.json`](../vercel.json):
   - **app** — Docker (`Dockerfile.vercel`), รวมเว็บหลัก
   - **docs** — Next.js ที่ `apps/docs` ผ่าน rewrite `/docs/*`
4. Production branch: ตั้งตามที่ใช้ (เช่น `main`)
5. Deploy ครั้งแรกจะล้มเหลวถ้ายังไม่มี env — ใส่ env ตามข้อ 3 แล้ว Redeploy

ทางเลือก: deploy เฉพาะ `apps/web` แบบ Next.js โดยตรง (ไม่ใช้ container) ได้ แต่ canonical ของรีโปนี้คือ `vercel.json` + `Dockerfile.vercel`

---

## 3. Environment Variables (Production)

คัดลอกจาก [`.env.example`](../.env.example) — **ห้าม commit `.env`**

### บังคับ (Workspace + Google session)

| ตัวแปร | คำอธิบาย |
| --- | --- |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` (อย่างน้อย 32 byte) — ใช้ลงชื่อและเข้ารหัสข้อมูลการเชื่อม GitHub ของแพลตฟอร์ม |
| `BETTER_AUTH_URL` | URL production เช่น `https://ai-sdk.pro` (ห้ามใช้ localhost ใน production) |
| `NEON_DATABASE_URL` | Neon PostgreSQL connection string ฝั่งเซิร์ฟเวอร์ |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client สำหรับ Google sign-in |
| `APP_ORIGINS` | Origin ที่อนุญาต CORS/chat เช่น `https://your-project.vercel.app` (คั่นด้วย comma ถ้ามีหลายโดเมน) |
| `TRUST_PROXY` | `true` บน Vercel — เปิด rate limit ต่อ client IP จาก `x-forwarded-for` |
| `BYOK_ONLY` | `true` สำหรับ production (public chat ใช้คีย์ผู้เยี่ยมเท่านั้น) |

### GitHub (เชื่อม Repository หลังล็อกอินแพลตฟอร์ม)

| ตัวแปร | คำอธิบาย |
| --- | --- |
| `GITHUB_CLIENT_ID` | OAuth App → Client ID |
| `GITHUB_CLIENT_SECRET` | OAuth App → Client secret |
| `GITHUB_APP_SLUG` | ทางเลือก ชื่อ GitHub App สำหรับติดตั้ง repo (default `ai-sdk-pro`) |

สร้าง OAuth App: GitHub → **Settings → Developer settings → OAuth Apps**  
**Authorization callback URL:** `https://<โดเมนจริง>/api/connections/github/callback`

### ทางเลือก

| ตัวแปร | เมื่อไหร่ |
| --- | --- |
| `PLATFORM_DEPLOY_ORIGIN` / `PLATFORM_BRIDGE_SECRET` | เชื่อมกับ Cloudflare deploy platform ([`infra/cloudflare-platform/`](./cloudflare-platform/)) |
| `NEXT_PUBLIC_CF_AGENT_URL` / `AGENT_AUTH_SECRET` | แชท keyless ผ่าน Cloudflare Agent Worker |
| `BLOB_READ_WRITE_TOKEN` | อัปโหลดไฟล์ผ่าน Vercel Blob (private store) |

## 4. Google OAuth

ตั้ง Authorized redirect URI เป็น `https://www.ai-sdk.pro/auth/platform` ตามที่ลงทะเบียนไว้ใน Google Cloud Console โดย production ใช้ `BETTER_AUTH_URL=https://ai-sdk.pro`; local ใช้ `http://localhost:3000` และ callback `http://localhost:3000/api/auth/callback/google`.

## 5. Custom domain (ทางเลือก)

1. Vercel → Project → **Domains** → เพิ่มโดเมน
2. อัปเดต `BETTER_AUTH_URL` และ `APP_ORIGINS` ให้ตรงกับโดเมนใหม่ แล้ว Redeploy
3. อัปเดต GitHub OAuth callback URL
4. เพิ่ม origin ของโดเมนใน `APP_ORIGINS` และกำหนด callback ที่ตรงกับ Google OAuth

---

## 6. Rate limit ผู้เยี่ยม (public chat)

ที่ `/api/chat` (BYOK):

- **20 คำขอ / นาที / client IP** (เมื่อ `TRUST_PROXY=true`)
- **120 คำขอ / นาทีทั้งระบบ** (in-memory ต่อ instance)

บน Vercel serverless ตัวจำกัดแยกต่อ function instance — ยังช่วยกัน abuse เบื้องต้น แต่ไม่แข็งเท่า VPS ตัวเดียว  
ถ้าต้องการ limit รวมศูนย์: พิจารณา Upstash Redis (ฟรี tier) ในเฟสถัดไป

---

## 7. Smoke tests หลัง deploy

แทน `<origin>` ด้วย URL จริง:

```bash
curl -fsS "<origin>/api/health"
curl -fsS "<origin>/api/ready"
curl -fsS -o /dev/null -w "%{http_code}\n" "<origin>/login"
```

ในเบราว์เซอร์:

1. `/login` → **Continue with Google**
2. `/workspace` โหลดได้หลัง session
3. `/workspace/account` → **Connect GitHub** (ต้องมี OAuth ข้อ 3)
4. `/chat` → ส่งข้อความ BYOK (ต้องกรอก API key เอง) — ลอง spam เกิน 20 ครั้ง/นาที ควรได้ HTTP 429

---

## 8. ทางเลือกอื่น (ไม่บังคับ)

| ทาง | เมื่อไหร่ |
| --- | --- |
| [DEPLOY-COOLIFY.md](./DEPLOY-COOLIFY.md) | legacy self-host บน VPS |
| `pnpm --filter @aisdkpro/web cf:deploy` | Cloudflare Pages/OpenNext |
| [cloudflare-platform](./cloudflare-platform/README.md) | deploy โปรเจกต์ลูกค้าจาก GitHub (Workers/D1) — โมดูลแยก |

---

## สรุปลำดับงาน

1. Neon + Better Auth config + `platform:migrate`
2. Vercel import repo
3. ใส่ secrets บน Vercel
4. Google OAuth redirect URI
5. GitHub OAuth App + callback
6. Deploy → smoke tests
7. (ทางเลือก) custom domain + Cloudflare user-deploy เฟส 2