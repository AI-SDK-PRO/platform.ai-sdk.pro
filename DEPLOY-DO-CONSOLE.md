# Deploy droplet เดิมเมื่อ SSH / GitHub ใช้ไม่ได้

Droplet: **ai-sdk-pro-prod** · IPv4 **167.172.73.127** · ID `617656205` · Singapore `sgp1`

ใช้เมื่อ:

- SSH จากเครื่องคุณไม่ติด (แรมเต็ม / process ค้าง)
- GitHub ถูกแบน → **ห้ามพึ่ง GHCR** และ Actions
- Cloud Agent **ยังไม่ได้** secret `VPS_SSH_*` (ดูด้านล่าง “ทำไม Team secret ไม่เข้า agent”)

## ทาง A — DigitalOcean Web Console (ไม่ต้อง SSH)

1. [cloud.digitalocean.com](https://cloud.digitalocean.com) → Droplets → **ai-sdk-pro-prod**
2. **Access** → **Launch Droplet Console** (หรือ **Recovery** → Power cycle ถ้าค้าง)
3. ล็อกอินด้วย root / SSH key ที่เคยตั้งไว้บนคอนโซล
4. วางบล็อกนี้ทั้งก้อน:

```bash
set -eux
# แรม + swap (4 GiB VPS)
free -h
if ! swapon --show | grep -q swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
fi
docker system prune -af || true

ROOT=/opt/ai-sdk-pro
CURRENT="$ROOT/current"
mkdir -p "$ROOT/config"
[ -f "$ROOT/config/app.env" ] || { echo "สร้าง $ROOT/config/app.env จาก .env.example ก่อน"; exit 1; }

if [ ! -d "$CURRENT/.git" ]; then
  git clone --depth 1 https://github.com/z-ey3eiei/platform.ai-sdk.pro.git "$CURRENT"
else
  git -C "$CURRENT" fetch origin main && git -C "$CURRENT" checkout main && git -C "$CURRENT" pull --ff-only origin main
fi

cd "$CURRENT"
chmod +x scripts/vps-update-release.sh
# ไม่ใช้ GHCR เพราะ GitHub account อาจถูกแบน — build บน VPS (มี swap แล้ว)
BUILD_MODE=build ./scripts/vps-update-release.sh
```

5. หลังจบ:

```bash
curl -sS https://platform.ai-sdk.pro/api/health
curl -sS https://platform.ai-sdk.pro/api/ready
```

`git clone` บน VPS ใช้ **HTTPS สาธารณะ** ไม่ต้องใช้บัญชี GitHub ของคุณ (แค่ repo ต้อง public / อนุญาต anonymous read)

## ทาง B — ให้ Cloud Agent SSH แทนคุณ (หลังแก้ secret)

Team secret ใน Cursor **ไม่ได้** inject เข้า Cloud Agent อัตโนมัติ ต้องอยู่ในรายชื่อ secret ของ **Environment นี้**:

Dashboard → [Cloud Agents → Environment](https://cursor.com/dashboard/cloud-agents/environments/e/5e042e0e-e320-11f1-b825-9a9eda18fdae) → **Secrets** → เพิ่มชื่อพอดี:

| ชื่อ | ค่า |
|------|-----|
| `VPS_SSH_HOST` | `167.172.73.127` |
| `VPS_SSH_USER` | `root` |
| `VPS_SSH_PRIVATE_KEY` | เนื้อหา private key ทั้งก้อน |

บันทึกแล้ว **Restart agent** (session เก่าไม่เห็นค่าใหม่)

รอบถัดไป agent รัน: `./scripts/agent-ssh-deploy.sh` (โหมด `BUILD_MODE=pull` หรือ `build` ตามแรม)

ถ้า “บันทึกไม่ได้” บนหน้า Environment:

- ลองสร้าง secret ที่ **Dashboard → Settings → Secrets** แล้วเลือก scope **Team** และเพิ่ม **ชื่อเดียวกัน** ใน Environment allowlist
- ชื่อ secret ต้องตรงตัวพิมพ์ใหญ่–เล็ก (`VPS_SSH_PRIVATE_KEY` ไม่ใช่ `vps_ssh_key`)
- หลังบันทึก เปิด agent **ใหม่** จาก repo นี้ ไม่ใช่แค่ส่งแชทต่อใน session เดิม

## GitHub ถูกแบน — สิ่งที่กระทบแพลตฟอร์ม

| สิ่งที่หลุด | ทางเลือก |
|-------------|----------|
| Login ด้วย GitHub OAuth | ใช้ช่องทาง auth อื่นใน Better Auth (อีเมล) หรือปิด GitHub ใน `app.env` ชั่วคราว |
| `GHCR_TOKEN` / image pull | ใช้ `BUILD_MODE=build` บน VPS (มี swap) |
| `npm publish` / Actions | publish CLI จากเครื่อง local ด้วย `npm login` บัญชีที่ไม่ถูกแบน |

## Remote MCP บนเครื่องคุณ (ถ้ามี SSH key แต่ agent ไม่มี)

ติดตั้ง [Desktop Commander](https://mcp.desktopcommander.app/) + **device เชื่อมต่อ** (`device_count > 0`) แล้วบอก agent ให้รัน `ssh` ผ่าน MCP บนเครื่องคุณ — ตอนนี้บัญชีคุณรายงาน `device_count: 0` จึงยังใช้ไม่ได้จนกว่าจะเปิด client

## ห้ามทำ

- ส่ง private key หรือ DO token ในแชท
- อนุมัติ DigitalOcean MCP ถ้าไม่ต้องการ (ใช้ Console ทาง A แทนได้)