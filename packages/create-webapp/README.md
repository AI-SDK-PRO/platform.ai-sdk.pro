# create-webapp (`aisdkpro`)

CLI สำหรับสร้างโปรเจกต์เริ่มต้นของ **ai-sdk.pro** จากชุด starters อย่างเป็นทางการ (`streaming-chat`, `docs-assistant`, `agent-launchpad`)

## การใช้งาน

```bash
# เลือก template แบบโต้ตอบ
npx create-webapp@latest aisdkpro

# หรือระบุ template และโฟลเดอร์ปลายทางโดยตรง
npx create-webapp@latest aisdkpro --template streaming-chat my-ai-app
npx create-webapp@latest aisdkpro --template docs-assistant my-docs-bot
npx create-webapp@latest aisdkpro --template agent-launchpad my-site
```

## คำสั่งที่มี

- `--template, -t <slug>`: เลือก starter (`streaming-chat`, `docs-assistant`, `agent-launchpad`)
- `--list, -l`: แสดงรายการ starters ทั้งหมดใน registry
- `--yes, -y`: ข้ามการถามและใช้ค่าเริ่มต้น
- `--force, -f`: เขียนทับเมื่อโฟลเดอร์ปลายทางมีไฟล์อยู่แล้ว
- `--registry <url>`: อ้างอิง JSON registry ของเซิร์ฟเวอร์หลัก (`https://platform.ai-sdk.pro/api/templates/registry`)

## การเผยแพร่ขึ้น npm registry

1. รันตรวจสอบแพ็กเกจ:
   ```bash
   npm run build --workspace=packages/create-webapp
   npm run test --workspace=packages/create-webapp
   npm run publish:dry-run --workspace=packages/create-webapp
   ```
2. **หมายเหตุเรื่องชื่อบน public npm:** หากชื่อ `create-webapp` บน public npmjs.org มีเจ้าของเดิมอยู่แล้ว ให้เปลี่ยน `"name"` ใน `package.json` เป็น `@aisdkpro/create-webapp` หรือ `create-aisdkpro` (และตั้ง `bin` ให้ตรงกัน) ก่อนรัน `npm publish --access public` หรือเผยแพร่เข้า private npm registry ขององค์กรที่ใช้ชื่อ `create-webapp` ได้ทันทีครับ
