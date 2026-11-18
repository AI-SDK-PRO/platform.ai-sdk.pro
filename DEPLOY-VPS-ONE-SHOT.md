# Deploy รอบอัปเดต (รวม monorepo + platform + เกี่ยวกับฉัน)

อัปเดตล่าสุดบน `main` (หลัง merge PR #3) — รันบน **VPS ที่คุณ SSH ได้** หลังตั้ง `app.env` ครบแล้ว

## ตัวแปรที่ต้องมีใน `/opt/ai-sdk-pro/config/app.env`

ตรวจก่อน deploy (ต้องไม่ว่าง):

| ตัวแปร | จำเป็น |
|--------|--------|
| `DOMAIN` | ใช่ |
| `ACME_EMAIL` | ใช่ (Caddy) |
| `BYOK_ONLY=true` | แนะนำ production |
| `APP_ORIGINS` | `https://platform.ai-sdk.pro,https://ai-sdk.pro` |
| `BETTER_AUTH_URL` | `https://platform.ai-sdk.pro` |
| `BETTER_AUTH_SECRET` | อย่างน้อย 32 ไบต์ |
| `NEON_DATABASE_URL` | workspace / import |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_APP_SLUG` | GitHub link |
| `PLATFORM_DEPLOY_ORIGIN` | `https://platform.ai-sdk.pro` |
| Firebase public config | อยู่ใน repo (`firebase-applet-config.json`) + authorized domain ใน Firebase console |

คัดลอกแม่แบบ: `.env.example`

## แรมเต็ม / VPS 4 GiB (สำคัญ)

`docker build` + `npm run build` ภายใน Dockerfile กิน RAM สูงมาก — บน Droplet 4 GiB มัก **OOM** หรือ swap เต็ม

**อย่า** รัน `npm ci` / `npm run build` บน VPS ถ้าไม่จำเป็น (ใช้ migrate แยกหรือรันจากเครื่องอื่น)

ทางที่เบากว่า — **ดึง image จาก GHCR** แทน build บนเครื่อง:

```bash
# ครั้งแรก: login GHCR (PAT ต้องมี read:packages)
echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin

cd /opt/ai-sdk-pro/current
git pull origin main
BUILD_MODE=pull ./scripts/vps-update-release.sh
```

สคริปต์โหมด `auto` จะเลือก `pull` เองถ้า `MemAvailable` ต่ำกว่า ~2.2 GiB

ถ้าจำเป็นต้อง build บน VPS — เพิ่ม swap ชั่วคราวแล้วค่อย build:

```bash
free -h
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
docker system prune -f
BUILD_MODE=build ./scripts/vps-update-release.sh
```

ถ้าแรมเต็มระหว่าง deploy อยู่:

```bash
docker ps -a
docker system df
sudo swapon --show
# หยุด build ค้าง: docker ps | awk '/build/ {print $1}' | xargs -r docker stop
```

---

## คำสั่งเดียวจบ (แนะนำ)

```bash
curl -fsSL https://raw.githubusercontent.com/z-ey3eiei/platform.ai-sdk.pro/main/scripts/vps-update-release.sh -o /tmp/vps-update-release.sh
chmod +x /tmp/vps-update-release.sh
sudo env ROOT=/opt/ai-sdk-pro CURRENT=/opt/ai-sdk-pro/current /tmp/vps-update-release.sh
```

หรือถ้า clone อยู่แล้ว:

```bash
cd /opt/ai-sdk-pro/current
git pull origin main
chmod +x scripts/vps-update-release.sh
./scripts/vps-update-release.sh
```

สคริปต์จะ: pull → `docker build` → `compose up` → (พยายาม migration Neon) → curl health/ready/templates/registry

## ตรวจมือหลัง deploy

```bash
curl -sS https://platform.ai-sdk.pro/api/health
curl -sS https://platform.ai-sdk.pro/api/ready
curl -sS https://platform.ai-sdk.pro/api/templates/registry | head -c 400
```

ในเบราว์เซอร์:

- หน้าแรก แสดง `npx create-webapp@latest aisdkpro`
- `/workspace/about` หลัง login (เกี่ยวกับฉัน)
- `/chat` BYOK ยังไม่ fallback owner key

## Rollback ด่วน

```bash
cd /opt/ai-sdk-pro
export APP_IMAGE=ai-sdk-pro-web:<tag-เก่า>
docker compose -f infra/production/docker-compose.yml up -d
```

## สิ่งที่ agent ตรวจใน repo แล้ว (ก่อนให้คุณรัน)

- `npm ci` + `npm run typecheck` + `npm run build` ผ่าน
- `npm test` 110/110 ผ่าน (อัปเดต security tests ให้ตรง Firebase auth)
- `infra/production/docker-compose.yml` + Caddy รองรับ `ai-sdk.pro` และ `platform.ai-sdk.pro`

Docker build บน VPS ใช้ `Dockerfile` ที่ root (npm ci + npm run build standalone Next.js)