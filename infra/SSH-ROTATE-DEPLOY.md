# หมุนคีย์ SSH สำหรับ `deploy@167.172.73.127`

คำสั่งปกติบนเครื่องคุณ:

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/ai-sdk-pro-server-key.pem deploy@167.172.73.127
```

## ทำไมพอร์ต 22 ไม่ตอบ

1. **Droplet ปิดอยู่** — API รายงาน `ai-sdk-pro-prod` สถานะ **`off`** (ไม่ใช่แค่คีย์ผิด)
2. จาก Cloud Agent ยิงพอร์ต 22 → timeout (อาจมี firewall จำกัด IP ด้วย — ปกติ SSH จากเครื่องคุณยังได้ถ้าเครื่อง **on**)
3. ถ้าเพิ่ง **ลบคีย์เก่าใน DO** แต่ยังไม่ใส่ public key ใหม่ใน  
   `/home/deploy/.ssh/authorized_keys` บน VPS → เครื่อง on แล้วก็ **login ไม่ได้**

> หมายเหตุ: บัญชี DO มีข้อความ **account lock** — agent สั่ง `power_on` ผ่าน API ไม่ได้ (`403`). ต้องเปิด droplet ใน **DigitalOcean Control Panel** เอง

## ขั้นที่ 1 — เปิด droplet

1. [cloud.digitalocean.com](https://cloud.digitalocean.com) → **ai-sdk-pro-prod**
2. ถ้าสถานะ Off → **Power on** (หรือ Power cycle ถ้าค้าง)
3. รอสถานะ **Active**

## ขั้นที่ 2 — ถ้า SSH ยังไม่เข้า: ใส่คีย์ใหม่ผ่าน Console

1. Droplet → **Access** → **Launch Droplet Console**
2. ล็อกอินเป็น **root** (หรือ recover ตามที่ DO ให้)
3. วางบล็อกนี้ (แก้บรรทัด `PASTE_PUBLIC_KEY_ONE_LINE`):

```bash
set -eux
DEPLOY_USER=deploy
PUB='PASTE_PUBLIC_KEY_ONE_LINE'

id "$DEPLOY_USER" || useradd -m -s /bin/bash "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER" 2>/dev/null || true
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
AUTH="/home/$DEPLOY_USER/.ssh/authorized_keys"
touch "$AUTH"
chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH"
chmod 600 "$AUTH"
# แทนที่ทั้งไฟล์ด้วยคีย์ใหม่เท่านั้น (หลังเพิกถอนคีย์เก่า)
printf '%s\n' "$PUB" > "$AUTH"
grep -q '^Port 22' /etc/ssh/sshd_config || echo 'Port 22' >> /etc/ssh/sshd_config
systemctl restart ssh || systemctl restart sshd
ss -tlnp | grep ':22' || true
```

### เอา public key จากไฟล์ `.pem` บนเครื่องคุณ

```bash
ssh-keygen -y -f ~/.ssh/ai-sdk-pro-server-key.pem
```

คัดลอกบรรทัดที่ขึ้น (`ssh-ed25519` หรือ `ssh-rsa` …) ไปแทน `PASTE_PUBLIC_KEY_ONE_LINE`

## ขั้นที่ 3 — ทดสอบจากเครื่องคุณ

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/ai-sdk-pro-server-key.pem deploy@167.172.73.127 'whoami && hostname'
```

## ขั้นที่ 4 — ให้ Cloud Agent SSH แทน (ไม่วาง key ในแชท)

[Environment Secrets](https://cursor.com/dashboard/cloud-agents/environments/e/5e042e0e-e320-11f1-b825-9a9eda18fdae):

| ชื่อ | ค่า |
|------|-----|
| `VPS_SSH_HOST` | `167.172.73.127` |
| `VPS_SSH_USER` | `deploy` |
| `VPS_SSH_PRIVATE_KEY` | เนื้อหาไฟล์ `ai-sdk-pro-server-key.pem` ทั้งก้อน |

Restart agent แล้วรัน `./scripts/agent-ssh-deploy.sh`

Agent จากเครือข่าย Cursor **อาจยัง SSH ไม่ได้** ถ้า firewall รับแค่ IP บ้าน — deploy บน VPS ยังทำจากเครื่องคุณหรือ Console ได้

## หลัง SSH เข้าได้ — deploy รอบล่าสุด

```bash
cd /opt/ai-sdk-pro/current
git pull origin main
BUILD_MODE=pull ./scripts/vps-update-release.sh   # หรือ BUILD_MODE=build + swap ถ้าไม่มี GHCR
```

ดูเพิ่ม: `DEPLOY-DO-CONSOLE.md`, `DEPLOY-VPS-ONE-SHOT.md`