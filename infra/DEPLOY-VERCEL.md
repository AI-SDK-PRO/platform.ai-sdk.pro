# Deploy บน Vercel (ไม่ใช้ VPS)

คู่มือนี้ใช้เมื่อต้องการ **import Git repository แล้ว deploy อัตโนมัติ** โดยไม่เช่า VPS/Coolify/SSH

สแต็กที่แนะนำ (โควต้าฟรีระดับ hobby):

| บริการ | หน้าที่ |
| --- | --- |
| **Vercel Hobby** | โฮสต์ Next.js (`apps/web` + `apps/docs` ผ่าน [`vercel.json`](../vercel.json)) |
| **Neon Free** | Postgres สำหรับ Workspace / GitHub token / session mapping |
| **Firebase Spark** | ล็อกอิน Google + Email/Password + Firestore ส่วนตัวผู้ใช้ |

ล็อกอินหลักเป็น **Firebase** (ไม่ใช้ไฟล์ Firebase Admin SDK บนเซิร์ฟเวอร์)  
GitHub ใช้ **OAuth App แยก** สำหรับเชื่อม Repository หลังล็อกอินแล้ว

---

## 1. เตรียม Neon และ migration

1. สร้างโปรเจกต์ที่ [neon.tech](https://neon.tech) (Free tier)
2. คัดลอก connection string → ตั้งเป็น `NEON_DATABASE_URL` (เก็บเป็น secret บน Vercel เท่านั้น)
3. บนเครื่องพัฒนาหรือ CI ที่มี secret:

   ```bash
   pnpm install
   export NEON_DATABASE_URL='postgresql://...'
   pnpm --filter @aisdkpro/web platform:migrate
   ```

   สคริปต์รัน migration ตามลำดับ: `0001_platform.sql`, `0006_platform_tokens.sql`, `0007_deployment_intake.sql`, `0008_preview_dispatch.sql`

---

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

### บังคับ (Workspace + session)

| ตัวแปร | คำอธิบาย |
| --- | --- |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` (อย่างน้อย 32 byte) — ใช้ลงชื่อ session cookie และเข้ารหัส GitHub token |
| `BETTER_AUTH_URL` | URL production เช่น `https://your-project.vercel.app` (ต้องตรงกับโดเมนที่เปิดใช้) |
| `NEON_DATABASE_URL` | Connection string จาก Neon |
| `APP_ORIGINS` | Origin ที่อนุญาต CORS/chat เช่น `https://your-project.vercel.app` (คั่นด้วย comma ถ้ามีหลายโดเมน) |
| `TRUST_PROXY` | `true` บน Vercel — เปิด rate limit ต่อ client IP จาก `x-forwarded-for` |
| `BYOK_ONLY` | `true` สำหรับ production (public chat ใช้คีย์ผู้เยี่ยมเท่านั้น) |

### GitHub (เชื่อม Repository หลังล็อกอิน Firebase)

| ตัวแปร | คำอธิบาย |
| --- | --- |
| `GITHUB_CLIENT_ID` | OAuth App → Client ID |
| `GITHUB_CLIENT_SECRET` | OAuth App → Client secret |
| `GITHUB_APP_SLUG` | ทางเลือก ชื่อ GitHub App สำหรับติดตั้ง repo (default `ai-sdk-pro`) |

สร้าง OAuth App: GitHub → **Settings → Developer settings → OAuth Apps**  
**Authorization callback URL:** `https://<โดเมนจริง>/api/auth/callback/github`

> การล็อกอินเข้า Workspace ใช้ **Google/Email ผ่าน Firebase** ไม่ใช่ GitHub OAuth โดยตรง GitHub ใช้เชื่อมที่ `/workspace/account` เท่านั้น

### Build-time (ฟอร์มอีเมลบนหน้า login)

| ตัวแปร | คำอธิบาย |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_EMAIL_AUTH_ENABLED` | `true` ถ้าต้องการสมัคร/เข้าด้วยอีเมลบน `/login` (ต้องตั้งก่อน build บน Vercel) |

คอนฟิก Firebase client มาจาก [`firebase-applet-config.json`](../firebase-applet-config.json) ใน repo แล้ว — ไม่ต้อง duplicate `apiKey` ลง env

### ทางเลือก

| ตัวแปร | เมื่อไหร่ |
| --- | --- |
| `PLATFORM_DEPLOY_ORIGIN` / `PLATFORM_BRIDGE_SECRET` | เชื่อมกับ Cloudflare deploy platform ([`infra/cloudflare-platform/`](./cloudflare-platform/)) |
| `NEXT_PUBLIC_CF_AGENT_URL` / `AGENT_AUTH_SECRET` | แชท keyless ผ่าน Cloudflare Agent Worker |
| `BLOB_READ_WRITE_TOKEN` | อัปโหลดไฟล์ผ่าน Vercel Blob (private store) |

ตัวแปร `RESEND_*` / `PLATFORM_EMAIL_AUTH_ENABLED` ใน `.env.example` เป็น legacy ของ Better Auth email — production ใช้ Firebase Email แทน

---

## 4. Firebase Console

โปรเจกต์: `gen-lang-client-0257543355` (ดู [`firebase-applet-config.json`](../firebase-applet-config.json))

1. [Authentication → Sign-in method](https://console.firebase.google.com/project/gen-lang-client-0257543355/authentication/providers)
   - เปิด **Google**
   - เปิด **Email/Password** (ถ้าใช้สมัครด้วยอีเมล)
2. [Authentication → Settings → Authorized domains](https://console.firebase.google.com/project/gen-lang-client-0257543355/authentication/settings)
   - เพิ่ม `<your-project>.vercel.app`
   - เพิ่ม custom domain เมื่อพร้อม
3. **Firestore rules:** deploy จาก repo

   ```bash
   npm i -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules --project gen-lang-client-0257543355
   ```

   ใช้ไฟล์ [`firestore.rules`](../firestore.rules)

4. **อย่า** commit หรือใส่ Firebase Admin SDK JSON ใน Vercel env — เซิร์ฟเวอร์ verify `idToken` ผ่าน JWKS ของ Google อยู่แล้ว

---

## 5. Custom domain (ทางเลือก)

1. Vercel → Project → **Domains** → เพิ่มโดเมน
2. อัปเดต `BETTER_AUTH_URL` และ `APP_ORIGINS` ให้ตรงกับโดเมนใหม่ แล้ว Redeploy
3. อัปเดต GitHub OAuth callback URL
4. เพิ่มโดเมนใน Firebase Authorized domains

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

1. `/login` → **Continue with Google** (หรืออีเมลถ้าเปิด)
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

1. Neon + `platform:migrate`
2. Vercel import repo
3. ใส่ secrets บน Vercel
4. Firebase authorized domains + providers
5. GitHub OAuth App + callback
6. Deploy → smoke tests
7. (ทางเลือก) custom domain + Cloudflare user-deploy เฟส 2