import { redirect } from "next/navigation";
import { SIGN_UP_PATH } from "@/lib/auth-paths";

export default function SignupRedirect() {
  redirect(SIGN_UP_PATH);
}
