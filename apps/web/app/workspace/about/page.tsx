import type { Metadata } from "next";
import WorkspaceAbout from "../../../components/WorkspaceAbout";
import "../../../components/workspace-account.css";

export const metadata: Metadata = {
  title: "เกี่ยวกับฉัน | ai-sdk.pro",
  description:
    "Edit your private platform profile — display name and short bio stored in your Firestore account document.",
  robots: { index: false, follow: false },
};

export default function WorkspaceAboutPage() {
  return <WorkspaceAbout />;
}