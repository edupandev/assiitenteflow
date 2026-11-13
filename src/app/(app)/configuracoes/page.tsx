import { ModuleScaffold } from "@/components/layout/page-placeholder";

export default function ConfiguracoesPage() {
  return (
    <ModuleScaffold
      title="Configurações"
      description="Preferências da conta, assistente de IA e dispositivos conectados."
      phase="Fases 1–5"
      items={[
        "Dados do perfil e cargo do funcionário",
        "Preferências individuais do assistente de IA e limite de tokens",
        "Gerenciamento de tokens de dispositivos do sincronizador local",
      ]}
    />
  );
}
