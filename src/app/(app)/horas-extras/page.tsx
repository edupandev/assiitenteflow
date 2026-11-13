import { ModuleScaffold } from "@/components/layout/page-placeholder";

export default function HorasExtrasPage() {
  return (
    <ModuleScaffold
      title="Horas extras"
      description="Cálculo de jornada excedente, adicionais de 50%/100% e saldo mensal."
      phase="Fase 4"
      items={[
        "Cálculo baseado em jornada contratual, divisor mensal e valor salarial",
        "Adicionais configuráveis de 50%, 100%, feriados e regras personalizadas",
        "Exibição de horas normais, extras, saldo mensal e valor estimado",
        "Fechamento mensal automático todo dia 23 (horário de Brasília)",
      ]}
    />
  );
}
