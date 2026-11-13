import { ModuleScaffold } from "@/components/layout/page-placeholder";

export default function TarefasPage() {
  return (
    <ModuleScaffold
      title="Tarefas"
      description="Gerenciamento completo de tarefas do sistema e sincronização com o Notion."
      phase="Fase 3"
      items={[
        "Sincronização bidirecional via Notion API oficial",
        "Detecção de conflitos e prevenção de duplicidade por external_id",
        "Filtros avançados por projeto, prioridade, status, origem e prazo",
        "Exclusão e edição com trilha de auditoria",
      ]}
    />
  );
}
