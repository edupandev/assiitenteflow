import Link from "next/link";
import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function IntegracoesPage() {
  const { userId, profile } = await requireUserContext();
  const supabase = await createClient();

  const [notionRes, devicesRes] = await Promise.all([
    profile.organization_id
      ? supabase
          .from("integrations")
          .select("status, config, last_sync_at, last_error")
          .eq("organization_id", profile.organization_id)
          .eq("provider", "notion")
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("sync_devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true),
  ]);

  const hasNotionKey = Boolean(process.env.NOTION_API_KEY);
  const hasTelegram = Boolean(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_GROUP_CHAT_ID
  );
  const hasAI = Boolean(process.env.AI_API_KEY);
  const devicesCount = devicesRes.count ?? 0;

  const cards = [
    {
      name: "Sincronizador Local (Node.js)",
      description:
        "Monitoramento de pastas locais, README.md e commits Git sem depender do GitHub.",
      status: devicesCount > 0 ? "Conectado" : "Sem dispositivos",
      ok: devicesCount > 0,
      href: "/projetos",
      action: "Gerenciar em Projetos",
    },
    {
      name: "Notion API",
      description:
        "Sincronização bidirecional de tarefas via API oficial do Notion.",
      status:
        hasNotionKey && notionRes.data?.status === "connected"
          ? "Conectado"
          : hasNotionKey
          ? "Chave configurada"
          : "Chave pendente",
      ok: hasNotionKey && notionRes.data?.status === "connected",
      href: "/tarefas",
      action: "Configurar em Tarefas",
    },
    {
      name: "Telegram (Grupo Corporativo)",
      description:
        "Envio automático do relatório diário às 18:00 e fechamento mensal no dia 23.",
      status: hasTelegram ? "Configurado" : "Variáveis pendentes",
      ok: hasTelegram,
      href: "/admin",
      action: "Ver entregas em Admin",
    },
    {
      name: `Provedor de IA (${process.env.AI_PROVIDER ?? "gemini"})`,
      description: `Modelo configurado: ${process.env.AI_MODEL ?? "gemini-2.5-flash"}.`,
      status: hasAI ? "Ativo" : "Modo econômico (sem chave)",
      ok: hasAI,
      href: "/assistente",
      action: "Abrir Assistente IA",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Integrações
        </h1>
        <p className="text-sm text-neutral-500">
          Status das integrações oficiais e serviços conectados.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((c) => (
          <Card key={c.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>{c.name}</CardTitle>
              <Badge variant={c.ok ? "success" : "warning"}>{c.status}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-neutral-600">{c.description}</p>
              <Link href={c.href}>
                <Button variant="outline" size="sm">
                  {c.action}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
