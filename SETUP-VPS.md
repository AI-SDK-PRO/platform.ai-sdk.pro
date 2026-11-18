# คำสั่งติดตั้ง monorepo รวม (platform + ai-sdk.pro) บน VPS

รีโป canonical หลังรวม: **`z-ey3eiei/platform.ai-sdk.pro`** (monorepo เดียว — web, docs, SDK, `create-webapp`, infra)

โดเมนแนะนำ:

| บทบาท | โฮสต์ |
| --- | --- |
| หน้าร้าน / marketing | `https://ai-sdk.pro` |
| Workspace แพลตฟอร์ม (login, import, deploy) | `https://platform.ai-sdk.pro` |

คุณจะ **public แพ็กเก็จ npm `create-webapp` เอง** และ **deploy บน VPS เอง** ตามขั้นตอนด้านล่าง

## 1. เตรียมเครื่องพัฒนา / build image

```bash
git clone https://github.com/z-ey3eiei/platform.ai-sdk.pro.git
cd platform.ai-sdk.pro
npm ci
npm run typecheck
npm test
npm run build
```

## 2. เผยแพร่ CLI (ทำครั้งเดียวหรือเมื่ออัปเดต starter)

```bash
cd packages/create-webapp
npm run build
npm run publish:dry-run   # ตรวจก่อน
npm publish --access public   # หลังคุณ login npm และเลือกชื่อแพ็กเก็จ (ดู packages/create-webapp/README.md)
```

หลัง publish แล้ว คำสั่งบนเว็บและ registry คือ:

```bash
npx create-webapp@latest aisdkpro
npx create-webapp@latest aisdkpro --template streaming-chat
```

## 3. ตั้งค่า `.env` บน VPS

คัดลอกจาก `.env.example` ไป `/opt/ai-sdk-pro/config/app.env` (อย่า commit)

ค่าสำคัญสำหรับมุมมองแพลตฟอร์ม:

```dotenv
APP_ORIGINS=https://platform.ai-sdk.pro,https://ai-sdk.pro
BETTER_AUTH_URL=https://platform.ai-sdk.pro
PLATFORM_DEPLOY_ORIGIN=https://platform.ai-sdk.pro
BYOK_ONLY=true
NEON_DATABASE_URL=...
BETTER_AUTH_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

OAuth callback GitHub: `https://platform.ai-sdk.pro/api/auth/callback/github`

Firebase: เพิ่ม `platform.ai-sdk.pro` ใน authorized domains ก่อนเปิด login

## 4. Build และรันด้วย Docker (บน VPS)

```bash
cd /opt/ai-sdk-pro/current   # โฟลเดอร์ที่ clone/checkout ล่าสุด
docker compose -f infra/production/docker-compose.yml build
docker compose -f infra/production/docker-compose.yml up -d
curl -sS https://platform.ai-sdk.pro/api/health
curl -sS https://platform.ai-sdk.pro/api/ready
```

รายละเอียด Caddy, rollback และสถานะ production: `infra/RUNBOOK.md`, `infra/DEPLOYMENT-STATE.md`, `infra/UNIFIED-WORKSPACE.md`

## 5. หลัง deploy — ตรวจด้วยมือ

1. หน้าแรกแสดงคำสั่ง `npx create-webapp@latest aisdkpro`
2. `/templates` และ `/api/templates/registry` สอดคล้องกับ CLI
3. Login → `/workspace` → **เกี่ยวกับฉัน** บันทึกโปรไฟล์ใน Firestore ได้ (อีเมลต้อง verified)
4. BYOK `/chat` ยังไม่ fallback ไป owner key

## 6. โครง monorepo (อ้างอิง)

```
apps/web          # Next.js แพลตฟอร์ม + playground
apps/docs         # Fumadocs
packages/sdk      # @aisdkpro/client
packages/create-webapp   # CLI npm (create-webapp)
packages/ui
starters/         # แหล่ง ZIP + sync เข้า CLI
infra/            # Docker, Caddy, Cloudflare worker sources
```

รีโปเก่า `z-ey3eiei/ai-sdk-pro` ถูกรวมเข้ามาใน monorepo นี้แล้ว — ใช้ `platform.ai-sdk.pro` เป็น upstream หลักสำหรับงานใหม่