import { ModuleScaffold } from "@/components/layout/page-placeholder";

export default function IntegracoesPage() {
  return (
    <ModuleScaffold
      title="Integrações"
      description="Conexões oficiais com Notion, GitHub, Telegram e provedor de IA."
      phase="Fases 2, 3 e 5"
      items={[
        "Notion API oficial para sincronização de tarefas",
        "GitHub API e webhooks para commits, branches e repositórios",
        "Telegram Bot API para relatório diário às 18:00 e fechamento do dia 23",
        "Dispositivos do sincronizador local com autenticação dedicada",
      ]}
    />
  );
}
