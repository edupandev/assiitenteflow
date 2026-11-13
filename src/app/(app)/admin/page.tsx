import { redirect } from "next/navigation";
import { requireUserContext } from "@/lib/auth";
import { ModuleScaffold } from "@/components/layout/page-placeholder";

export default async function AdminPage() {
  const { isAdmin } = await requireUserContext();
  if (!isAdmin) {
    redirect("/dashboard");
  }

  return (
    <ModuleScaffold
      title="Administração"
      description="Gestão de funcionários, regras de jornada, fechamento mensal e auditoria."
      phase="Fases 1–6"
      items={[
        "Gerenciamento de funcionários, perfis e permissões",
        "Configuração de escalas, feriados e regras globais/individuais de horas extras",
        "Reabertura administrativa de fechamento mensal com registro em auditoria",
        "Monitoramento de fila de background jobs e entregas no Telegram",
      ]}
    />
  );
}
