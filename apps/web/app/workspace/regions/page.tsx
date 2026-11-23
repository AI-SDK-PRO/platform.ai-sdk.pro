import type { Metadata } from "next";
import WorkspaceRegions from "../../../components/WorkspaceRegions";
import { getGoogleMapsApiKey } from "../../../lib/google-maps-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Regions | ai-sdk.pro Workspace",
  description:
    "Interactive map of active cloud regions, database locations, and VPS deployment nodes.",
};

export default function WorkspaceRegionsPage() {
  const apiKey = getGoogleMapsApiKey();
  return <WorkspaceRegions apiKey={apiKey} />;
}
