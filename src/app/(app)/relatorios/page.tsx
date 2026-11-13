import { ModuleScaffold } from "@/components/layout/page-placeholder";

export default function RelatoriosPage() {
  return (
    <ModuleScaffold
      title="Relatórios"
      description="Relatórios diários, mensais, produtividade, projetos, ponto e horas extras."
      phase="Fase 5"
      items={[
        "Filtros por funcionário, projeto, data e período",
        "Exportação individual em PDF e Excel (.xlsx)",
        "Armazenamento seguro no Supabase Storage",
        "Fechamentos mensais do período 01 a 23 com histórico",
      ]}
    />
  );
}
