import { ModuleScaffold } from "@/components/layout/page-placeholder";

export default function AssistentePage() {
  return (
    <ModuleScaffold
      title="Assistente IA"
      description="Assistente individual com cache de contexto e economia de tokens."
      phase="Fase 5"
      items={[
        "Contexto isolado por funcionário com resumos persistentes por projeto",
        "Detecção de alterações por hash para evitar reenvio de README completo",
        "Criação e sugestão de tarefas diretamente pela conversa",
        "Limite configurável de tokens e histórico resumido",
      ]}
    />
  );
}
