platform.ai-sdk.pro เป็นแพลตฟอร์มและชุดเครื่องมือสำหรับสร้าง เว็บแอป AI agent: มีเว็บแชตแบบสตรีมมิง ตัวอย่าง starter เอกสารภาษาไทย และ client SDK ส่วนระบบ Workspace นำเข้า source จาก GitHub ได้ ส่วนการ Build/Deploy มีโค้ดและ staging แยกอยู่ แต่ยังมีเงื่อนไขการเปิดใช้งานที่ต้องตรวจสอบก่อนใช้จริง

Stack

- ภาษา: TypeScript เป็นหลัก; มี JavaScript ใน Cloudflare platform และ Python สำหรับตรวจ/แพ็ก starter
- Framework / runtime: Next.js App Router, React, Node.js; Cloudflare Workers สำหรับ agent และระบบ deploy
- ไลบรารีสำคัญ: AI SDK 6, Better Auth, Drizzle ORM/Neon, Fumadocs, Cloudflare Agents SDK
- เครื่องมือ workspace: pnpm 10.18 และ Turborepo

How it's organized

apps/  
  web/                 เว็บหลัก, chat API, workspace และ GitHub integration  
  docs/                เอกสาร Fumadocs แยก build ได้  
  agent-worker/        Cloudflare Worker สำหรับ keyless chat และ quota  
packages/  
  sdk/                 @aisdkpro/client สำหรับเรียก chat stream  
  ui/                  คอมโพเนนต์และ design system ที่ใช้ร่วมกัน  
infra/  
  cloudflare-platform/ control plane, queue, sandbox build และ deploy staging  
  project-preview/     โค้ดระบบ preview แยก  
  workflows/           ตัวอย่าง workflow สำหรับ deploy/publish ที่ยัง opt-in  
starters/              ตัวอย่าง Streaming Chat, Docs Assistant, Agent Launchpad  
scripts/               ตรวจและแพ็ก starter

How it fits together: เว็บหลักจัดการหน้าเว็บและ chat endpoint โดย apps/web/app/api/chat/route.ts ตรวจ request และ BYOK ก่อนส่งให้ assistant-agent.ts สร้าง agent แล้วสตรีมผลกลับมา ส่วน packages/sdk มี ChatClient และ React hook สำหรับใช้ stream นั้นจากแอปอื่นได้ ข้อมูล Workspace และ repository snapshot อยู่คนละเส้นทางกับการรันโค้ดผู้ใช้

แนวทางที่แนะนำคือ ทำงานเป็นช่วงและอย่าเปิดทุกฟีเจอร์พร้อมกัน:

1. ยืนยันขอบเขตการใช้งานจริงก่อน — ทดสอบเว็บ, BYOK chat, GitHub login และ repository import พร้อมรัน test/typecheck/build ให้ผ่าน ใช้ staging หรือข้อมูลทดสอบ ไม่ใช้ข้อมูลจริงในการทดสอบ
2. ให้ความสำคัญกับขอบเขตความปลอดภัยของ deploy — ทดสอบเส้นทาง Workspace → Cloudflare control plane → queue → build → routing แบบ end-to-end ใน staging ก่อนเปิดใช้จริง เอกสารระบุว่า PLATFORM_BRIDGE_ENABLED และ PROJECT_ROUTING_READY ต้องเปิดอย่างระมัดระวัง; ปัจจุบัน static deployment เป็นขอบเขตเริ่มต้นที่เหมาะสมกว่า framework builds
3. ค่อยทำ keyless chat เป็นงานแยก — apps/agent-worker มีการผูก chat กับ user/thread และมี budget/quota guard แล้ว แต่ควรทดสอบ auth, การแยกข้อมูลผู้ใช้, การคิดค่าใช้จ่าย และกรณีเกินงบให้ครบก่อนเปิดใช้กับผู้ใช้
4. ปล่อย SDK หลังยืนยัน package จริง — packages/sdk มี build, test และ publish:dry-run แต่ README ระบุ workflow สำหรับ npm เป็น opt-in และการ publish ต้องตั้งค่า namespace/Trusted Publishing ก่อน อย่าสับสนว่า SDK นี้เป็น CLI หรือ deploy API เพราะขอบเขตปัจจุบันคือ chat client

มีข้อควรยึดเป็นหลัก: โค้ดจาก repository ที่ผู้ใช้นำเข้าเป็น untrusted code ควรรันเฉพาะใน build sandbox ที่แยกจากเว็บและ secret ของระบบ ห้ามนำมารันใน container ของ apps/web หรือให้เข้าถึง Docker socket, Neon, GitHub token หรือ credentials สำหรับ deploy

How to run it

จาก root ของ repo ใช้ Node.js 22 และ pnpm 10.18.0:

pnpm install --frozen-lockfile  
pnpm test  
pnpm typecheck  
pnpm build  
pnpm dev

เว็บหลักรันที่ apps/web; ถ้าต้องการรันเอกสารแยก ใช้ pnpm dev:docs สำหรับ chat ให้ใช้ BYOK ตาม flow ในเว็บ หรือกำหนดค่า server-side สำหรับการพัฒนา—อย่าใส่ provider key ใน client code หรือ commit ลง Git ค่า environment ตัวอย่างอยู่ใน .env.example และมี secret สำหรับ auth/database/GitHub ที่ต้องตั้งเพิ่มหากจะทดสอบ Workspace

สำหรับ Cloudflare platform ให้ทำงานแยกที่โฟลเดอร์นั้น:

cd infra/cloudflare-platform  
npm ci  
npm test  
npm run check  
npm run dry-runplatform.ai-sdk.pro เป็นแพลตฟอร์มและชุดเครื่องมือสำหรับสร้าง เว็บแอป AI agent: มีเว็บแชตแบบสตรีมมิง ตัวอย่าง starter เอกสารภาษาไทย และ client SDK ส่วนระบบ Workspace นำเข้า source จาก GitHub ได้ ส่วนการ Build/Deploy มีโค้ดและ staging แยกอยู่ แต่ยังมีเงื่อนไขการเปิดใช้งานที่ต้องตรวจสอบก่อนใช้จริง

Stack

- ภาษา: TypeScript เป็นหลัก; มี JavaScript ใน Cloudflare platform และ Python สำหรับตรวจ/แพ็ก starter
- Framework / runtime: Next.js App Router, React, Node.js; Cloudflare Workers สำหรับ agent และระบบ deploy
- ไลบรารีสำคัญ: AI SDK 6, Better Auth, Drizzle ORM/Neon, Fumadocs, Cloudflare Agents SDK
- เครื่องมือ workspace: pnpm 10.18 และ Turborepo

How it's organized

apps/  
  web/                 เว็บหลัก, chat API, workspace และ GitHub integration  
  docs/                เอกสาร Fumadocs แยก build ได้  
  agent-worker/        Cloudflare Worker สำหรับ keyless chat และ quota  
packages/  
  sdk/                 @aisdkpro/client สำหรับเรียก chat stream  
  ui/                  คอมโพเนนต์และ design system ที่ใช้ร่วมกัน  
infra/  
  cloudflare-platform/ control plane, queue, sandbox build และ deploy staging  
  project-preview/     โค้ดระบบ preview แยก  
  workflows/           ตัวอย่าง workflow สำหรับ deploy/publish ที่ยัง opt-in  
starters/              ตัวอย่าง Streaming Chat, Docs Assistant, Agent Launchpad  
scripts/               ตรวจและแพ็ก starter

How it fits together: เว็บหลักจัดการหน้าเว็บและ chat endpoint โดย apps/web/app/api/chat/route.ts ตรวจ request และ BYOK ก่อนส่งให้ assistant-agent.ts สร้าง agent แล้วสตรีมผลกลับมา ส่วน packages/sdk มี ChatClient และ React hook สำหรับใช้ stream นั้นจากแอปอื่นได้ ข้อมูล Workspace และ repository snapshot อยู่คนละเส้นทางกับการรันโค้ดผู้ใช้

แนวทางที่แนะนำคือ ทำงานเป็นช่วงและอย่าเปิดทุกฟีเจอร์พร้อมกัน:

1. ยืนยันขอบเขตการใช้งานจริงก่อน — ทดสอบเว็บ, BYOK chat, GitHub login และ repository import พร้อมรัน test/typecheck/build ให้ผ่าน ใช้ staging หรือข้อมูลทดสอบ ไม่ใช้ข้อมูลจริงในการทดสอบ
2. ให้ความสำคัญกับขอบเขตความปลอดภัยของ deploy — ทดสอบเส้นทาง Workspace → Cloudflare control plane → queue → build → routing แบบ end-to-end ใน staging ก่อนเปิดใช้จริง เอกสารระบุว่า PLATFORM_BRIDGE_ENABLED และ PROJECT_ROUTING_READY ต้องเปิดอย่างระมัดระวัง; ปัจจุบัน static deployment เป็นขอบเขตเริ่มต้นที่เหมาะสมกว่า framework builds
3. ค่อยทำ keyless chat เป็นงานแยก — apps/agent-worker มีการผูก chat กับ user/thread และมี budget/quota guard แล้ว แต่ควรทดสอบ auth, การแยกข้อมูลผู้ใช้, การคิดค่าใช้จ่าย และกรณีเกินงบให้ครบก่อนเปิดใช้กับผู้ใช้
4. ปล่อย SDK หลังยืนยัน package จริง — packages/sdk มี build, test และ publish:dry-run แต่ README ระบุ workflow สำหรับ npm เป็น opt-in และการ publish ต้องตั้งค่า namespace/Trusted Publishing ก่อน อย่าสับสนว่า SDK นี้เป็น CLI หรือ deploy API เพราะขอบเขตปัจจุบันคือ chat client

มีข้อควรยึดเป็นหลัก: โค้ดจาก repository ที่ผู้ใช้นำเข้าเป็น untrusted code ควรรันเฉพาะใน build sandbox ที่แยกจากเว็บและ secret ของระบบ ห้ามนำมารันใน container ของ apps/web หรือให้เข้าถึง Docker socket, Neon, GitHub token หรือ credentials สำหรับ deploy

How to run it

จาก root ของ repo ใช้ Node.js 22 และ pnpm 10.18.0:

pnpm install --frozen-lockfile  
pnpm test  
pnpm typecheck  
pnpm build  
pnpm dev

เว็บหลักรันที่ apps/web; ถ้าต้องการรันเอกสารแยก ใช้ pnpm dev:docs สำหรับ chat ให้ใช้ BYOK ตาม flow ในเว็บ หรือกำหนดค่า server-side สำหรับการพัฒนา—อย่าใส่ provider key ใน client code หรือ commit ลง Git ค่า environment ตัวอย่างอยู่ใน .env.example และมี secret สำหรับ auth/database/GitHub ที่ต้องตั้งเพิ่มหากจะทดสอบ Workspace

สำหรับ Cloudflare platform ให้ทำงานแยกที่โฟลเดอร์นั้น:

cd infra/cloudflare-platform  
npm ci  
npm test  
npm run check  
npm run dry-run

<div align="center">

<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

  <h1>Built with AI Studio</h2>

  <p>The fastest path from prompt to production with Gemini.</p>

  <a href="https://aistudio.google.com/apps">Start building</a>

</div>
