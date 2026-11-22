import type { Metadata } from "next";
import AuthLogin from "../../../components/AuthLogin";

export const metadata: Metadata = {
  title: "AI SDK Pro account",
  robots: { index: false, follow: false },
};

export default async function PlatformAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return mode === "register"
    ? <AuthLogin key="register" initialMode="sign-up" platformRegistration />
    : <AuthLogin key="signin" />;
}
