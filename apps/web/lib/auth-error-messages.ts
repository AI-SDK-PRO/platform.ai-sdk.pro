// Neon Auth (managed Better Auth) reports failures as machine codes, either in
// the JSON body or as `?error=<code>` on the redirect back to /login. Without a
// mapping the login page shows nothing at all, which reads as "login is broken".
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  email_not_found:
    "ผู้ให้บริการล็อกอินไม่ได้ส่งอีเมลกลับมา (พบบ่อยกับ GitHub ที่ตั้งอีเมลเป็นส่วนตัว) กรุณาเปิดอีเมลใน GitHub หรือเข้าสู่ระบบด้วยอีเมลและรหัสผ่านแทน",
  access_denied: "คุณยกเลิกการอนุญาตในหน้าผู้ให้บริการ กรุณาลองใหม่อีกครั้ง",
  account_not_linked:
    "อีเมลนี้ผูกกับวิธีเข้าสู่ระบบอื่นอยู่ กรุณาเข้าสู่ระบบด้วยวิธีเดิมก่อน แล้วเชื่อมบัญชีใหม่ในหน้าตั้งค่า",
  provider_not_supported:
    "ผู้ให้บริการนี้ยังไม่เปิดใช้งานใน Neon Auth กรุณาใช้วิธีเข้าสู่ระบบอื่น หรือเปิดใช้งานที่ Neon Console → Auth → Providers",
  signup_disabled: "ระบบปิดรับสมัครสมาชิกใหม่ชั่วคราว",
  webhook_delivery_failed:
    "Neon Auth ปฏิเสธการสร้างบัญชี เพราะ webhook ที่ตั้งไว้ตอบกลับไม่สำเร็จ กรุณาปิดหรือแก้ URL ของ webhook ใน Neon Console → Auth → Configuration → Webhooks",
  invalid_callback_request:
    "ลิงก์ยืนยันหรือลิงก์เข้าสู่ระบบหมดอายุแล้ว กรุณาเริ่มเข้าสู่ระบบใหม่",
  state_mismatch:
    "ลิงก์ยืนยันหรือลิงก์เข้าสู่ระบบหมดอายุแล้ว กรุณาเริ่มเข้าสู่ระบบใหม่",
  please_restart_the_process:
    "ลิงก์ยืนยันหรือลิงก์เข้าสู่ระบบหมดอายุแล้ว กรุณาเริ่มเข้าสู่ระบบใหม่",
  email_not_verified: "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ",
  invalid_email_or_password: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  invalid_email: "รูปแบบอีเมลไม่ถูกต้อง",
  user_already_exists: "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ",
  password_too_short: "รหัสผ่านสั้นเกินไป ต้องมีอย่างน้อย 12 ตัวอักษร",
  password_too_long: "รหัสผ่านยาวเกินไป ต้องไม่เกิน 128 ตัวอักษร",
  banned: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
  too_many_requests: "พยายามบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
};

export function describeAuthError(
  code: string | null | undefined
): string | null {
  const normalized = code?.trim().toLowerCase();
  if (!normalized) return null;
  return (
    AUTH_ERROR_MESSAGES[normalized] ??
    `ไม่สามารถดำเนินการได้ (รหัสข้อผิดพลาด: ${normalized})`
  );
}

// Better Auth client results expose the machine code on `error.code`; the
// redirect flow only carries the code itself.
export function authErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code : null;
}
