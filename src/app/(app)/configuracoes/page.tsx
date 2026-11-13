import { requireUserContext } from "@/lib/auth";
import { SettingsClient } from "@/modules/settings/settings-client";

export default async function ConfiguracoesPage() {
  const { profile } = await requireUserContext();
  return <SettingsClient profile={profile} />;
}
