import { redirect } from "next/navigation";
import { SIGN_IN_PATH } from "@/lib/auth-paths";

export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const { auth_error } = await searchParams;
  redirect(auth_error === "1" ? SIGN_IN_PATH + "?auth_error=oauth_failed" : SIGN_IN_PATH);
}
