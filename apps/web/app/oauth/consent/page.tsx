import type { Metadata } from "next";
import AuthLogin from "../../../components/AuthLogin";

export const metadata: Metadata = {
  title: "Create your AI SDK Pro account",
  robots: { index: false, follow: false },
};

export default function PlatformConsentPage() {
  return <AuthLogin initialMode="sign-up" platformRegistration />;
}
