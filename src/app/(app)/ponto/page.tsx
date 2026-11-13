import { ModuleScaffold } from "@/components/layout/page-placeholder";

export default function PontoPage() {
  return (
    <ModuleScaffold
      title="Controle de ponto"
      description="Registros diários, calendário de jornada e preenchimento automático."
      phase="Fase 4"
      items={[
        "Jornada padrão 08:00–12:00 / 13:00–17:00 (8 horas)",
        "Distinção clara entre registros reais, manuais e estimados",
        "Preenchimento automático de dias elegíveis respeitando escala e feriados",
        "Edição justificada com auditoria completa",
      ]}
    />
  );
}
