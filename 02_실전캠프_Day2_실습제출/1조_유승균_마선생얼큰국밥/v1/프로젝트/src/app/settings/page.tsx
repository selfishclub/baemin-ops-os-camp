import { SettingsForm } from "@/components/SettingsForm";
import { availableProviders } from "@/lib/ai/client";
import { getSettings } from "@/lib/db";
import { isCloudRuntime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const port = process.env.PORT || "3400";
  return <SettingsForm initial={await getSettings()} providers={availableProviders()} ingestUrl={`http://localhost:${port}/api/reviews/ingest`} cloud={isCloudRuntime()} />;
}
