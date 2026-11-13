import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import { formatMinutesToHours, getTodayBR } from "@/lib/utils";
import { generateAICompletion, isAIConfigured } from "@/services/ai";

const sendMessageSchema = z.object({
  conversation_id: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1, "Mensagem vazia").max(2000),
});

export async function GET(request: NextRequest) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const convId = request.nextUrl.searchParams.get("conversation_id");

  const { data: conversations } = await supabase
    .from("assistant_conversations")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(20);

  let messages: unknown[] = [];
  const activeId = convId ?? conversations?.[0]?.id ?? null;

  if (activeId) {
    const { data: msgs } = await supabase
      .from("assistant_messages")
      .select("*")
      .eq("conversation_id", activeId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(50);
    messages = msgs ?? [];
  }

  return NextResponse.json({
    conversations: conversations ?? [],
    activeConversationId: activeId,
    messages,
    aiConfigured: isAIConfigured(),
  });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Mensagem inválida", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, full_name, role, ai_preferences")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "Organização não encontrada" }, { status: 400 });
  }

  let conversationId = parsed.data.conversation_id ?? null;

  if (!conversationId) {
    const title = parsed.data.message.slice(0, 50);
    const { data: createdConv, error: convErr } = await supabase
      .from("assistant_conversations")
      .insert({
        organization_id: profile.organization_id,
        user_id: user.id,
        title,
      })
      .select("id")
      .single();

    if (convErr || !createdConv) {
      return NextResponse.json(
        { error: convErr?.message ?? "Erro ao criar conversa" },
        { status: 400 }
      );
    }
    conversationId = createdConv.id;
  }

  // Salva mensagem do usuário
  await supabase.from("assistant_messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "user",
    content: parsed.data.message,
    token_count: 0,
  });

  const lower = parsed.data.message.toLowerCase();
  const today = getTodayBR();

  // Economia de tokens: comandos simples resolvidos direto no banco (0 tokens de IA)
  if (lower.startsWith("/tarefa ")) {
    const title = parsed.data.message.slice(8).trim();
    if (title) {
      const { data: createdTask, error: taskErr } = await supabase
        .from("tasks")
        .insert({
          organization_id: profile.organization_id,
          assignee_id: user.id,
          created_by: user.id,
          title,
          priority: "medium",
          status: "todo",
          origin: "system",
        })
        .select("id, title")
        .single();

      const replyText = taskErr
        ? `Não foi possível criar a tarefa: ${taskErr.message}`
        : `Tarefa criada direto no banco (0 tokens gastos): **${createdTask.title}**.`;

      const { data: savedMsg } = await supabase
        .from("assistant_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: replyText,
          token_count: 0,
          metadata: { source: "database_direct" },
        })
        .select("*")
        .single();

      return NextResponse.json({
        conversationId,
        reply: savedMsg,
        tokensUsed: 0,
      });
    }
  }

  // Carrega contexto compacto para o assistente
  const [tasksRes, summariesRes, eventsRes, timeRes, historyRes] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("title, status, priority, due_date, origin")
        .eq("assignee_id", user.id)
        .neq("status", "done")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(12),
      supabase
        .from("project_summaries")
        .select("persistent_summary, project:projects(name)")
        .eq("organization_id", profile.organization_id)
        .limit(8),
      supabase
        .from("project_sync_events")
        .select("event_type, summary, commit_sha, occurred_at, project:projects(name)")
        .eq("user_id", user.id)
        .order("occurred_at", { ascending: false })
        .limit(8),
      supabase
        .from("time_records")
        .select("worked_minutes, source")
        .eq("user_id", user.id)
        .eq("work_date", today)
        .maybeSingle(),
      supabase
        .from("assistant_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  // Se IA não estiver configurada, retorna resumo direto do banco
  if (!isAIConfigured()) {
    const tasksList = (tasksRes.data ?? []).map(
      (t) => `- [${t.status}] ${t.title} (${t.priority})`
    );
    const worked = formatMinutesToHours(timeRes.data?.worked_minutes ?? 0);
    const fallbackText = [
      `Modo econômico (IA não configurada no .env.local — resposta direta do banco):`,
      `• Horas trabalhadas hoje: ${worked}`,
      `• Tarefas ativas (${tasksList.length}):`,
      ...(tasksList.length ? tasksList : ["- Nenhuma tarefa pendente."]),
      `\nDica: use "/tarefa Nome da tarefa" para criar tarefas instantaneamente sem gastar tokens.`,
    ].join("\n");

    const { data: savedMsg } = await supabase
      .from("assistant_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "assistant",
        content: fallbackText,
        token_count: 0,
      })
      .select("*")
      .single();

    return NextResponse.json({
      conversationId,
      reply: savedMsg,
      tokensUsed: 0,
    });
  }

  const compactContext = {
    funcionario: profile.full_name,
    dataHoje: today,
    horasHoje: formatMinutesToHours(timeRes.data?.worked_minutes ?? 0),
    tarefasAtivas: tasksRes.data ?? [],
    resumosProjetos: summariesRes.data ?? [],
    evidenciasRecentesGit: eventsRes.data ?? [],
  };

  const systemPrompt = [
    "Você é o assistente individual de produtividade do funcionário no sistema PulseWork.",
    "Responda em português, de forma objetiva, clara e econômica.",
    "REGRA CRÍTICA: Use os resumos de projeto (README) apenas como contexto e os eventos Git/commits como evidência real de execução. Nunca afirme que algo foi concluído apenas porque está descrito no README.",
    `Contexto atual (JSON compacto):\n${JSON.stringify(compactContext)}`,
  ].join("\n\n");

  const recentMessages = (historyRes.data ?? [])
    .slice()
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    }));

  try {
    const maxTokens =
      (profile.ai_preferences as { max_tokens_per_request?: number } | null)
        ?.max_tokens_per_request ?? 900;

    const aiRes = await generateAICompletion({
      systemPrompt,
      messages: recentMessages,
      maxTokens,
    });

    const { data: savedMsg } = await supabase
      .from("assistant_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "assistant",
        content: aiRes.content,
        token_count: aiRes.tokensUsed,
        metadata: { provider: aiRes.provider, model: aiRes.model },
      })
      .select("*")
      .single();

    await supabase
      .from("assistant_conversations")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    return NextResponse.json({
      conversationId,
      reply: savedMsg,
      tokensUsed: aiRes.tokensUsed,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Erro ao consultar provedor de IA.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
