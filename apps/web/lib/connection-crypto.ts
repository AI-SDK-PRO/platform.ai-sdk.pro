import "server-only";
import {
  getPlatformConfig,
  PlatformSetupRequiredError,
} from "./platform-policy";
export function sessionKey() {
  const secret = getPlatformConfig().secret;
  if (secret.length < 32) throw new PlatformSetupRequiredError();
  return new TextEncoder().encode(secret);
}
export function readCookie(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith(name + "="))
    ?.slice(name.length + 1);
}
