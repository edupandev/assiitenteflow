"use client";

import * as React from "react";
import { Bot, MessageSquarePlus, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn, formatRelativeTimeBR } from "@/lib/utils";

interface ConversationItem {
  id: string;
  title: string;
  updated_at: string;
}

interface MessageItem {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  token_count: number;
  created_at: string;
}

interface AssistantClientProps {
  initialConversations: ConversationItem[];
  initialConversationId: string | null;
  initialMessages: MessageItem[];
  aiConfigured: boolean;
}

const QUICK_PROMPTS = [
  "Quais são minhas pendências prioritárias hoje?",
  "Resuma minhas atividades recentes nos projetos.",
  "Como está minha produtividade e jornada hoje?",
  "/tarefa Revisar pendências da semana",
];

export function AssistantClient({
  initialConversations,
  initialConversationId,
  initialMessages,
  aiConfigured,
}: AssistantClientProps) {
  const [conversations, setConversations] =
    React.useState<ConversationItem[]>(initialConversations);
  const [activeId, setActiveId] = React.useState<string | null>(
    initialConversationId
  );
  const [messages, setMessages] = React.useState<MessageItem[]>(initialMessages);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const tempIdRef = React.useRef(1);

  async function selectConversation(id: string) {
    setActiveId(id);
    setError(null);
    const res = await fetch(`/api/assistant?conversation_id=${id}`);
    const json = await res.json();
    if (res.ok) {
      setMessages(json.messages ?? []);
    }
  }

  function startNewConversation() {
    setActiveId(null);
    setMessages([]);
    setError(null);
  }

  async function sendPrompt(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);

    const optimisticUser: MessageItem = {
      id: `temp-${tempIdRef.current++}`,
      role: "user",
      content: trimmed,
      token_count: 0,
      created_at: "",
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput("");

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: activeId,
          message: trimmed,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro ao enviar mensagem.");
        return;
      }

      if (!activeId && json.conversationId) {
        setActiveId(json.conversationId);
        setConversations((prev) => [
          {
            id: json.conversationId,
            title: trimmed.slice(0, 50),
            updated_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      }

      if (json.reply) {
        setMessages((prev) => [...prev, json.reply as MessageItem]);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Assistente IA
          </h1>
          <p className="text-sm text-neutral-500">
            Contexto individual com cache de projetos e economia de tokens.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={aiConfigured ? "success" : "warning"}>
            {aiConfigured ? "Provedor IA ativo" : "Modo econômico (sem IA)"}
          </Badge>
          <Button variant="outline" size="sm" onClick={startNewConversation}>
            <MessageSquarePlus className="h-4 w-4" />
            <span>Nova conversa</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Lista de Conversas */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Histórico</CardTitle>
          </CardHeader>
          <CardContent className="p-2 space-y-1 max-h-[65vh] overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="p-3 text-xs text-neutral-500">
                Nenhuma conversa anterior.
              </p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  className={cn(
                    "w-full text-left rounded-lg px-3 py-2 text-xs transition-colors cursor-pointer",
                    activeId === c.id
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-700 hover:bg-neutral-100"
                  )}
                >
                  <p className="font-medium truncate">{c.title}</p>
                  <p
                    className={cn(
                      "text-[10px] mt-0.5",
                      activeId === c.id
                        ? "text-neutral-300"
                        : "text-neutral-400"
                    )}
                  >
                    {formatRelativeTimeBR(c.updated_at)}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Área do Chat */}
        <Card className="lg:col-span-3 flex flex-col min-h-[65vh]">
          <CardContent className="flex-1 p-4 space-y-4 overflow-y-auto max-h-[55vh]">
            {messages.length === 0 ? (
              <div className="py-8 text-center space-y-4">
                <Bot className="h-8 w-8 text-neutral-400 mx-auto" />
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    Como posso ajudar hoje?
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Consulte projetos, pendências, produtividade ou use{" "}
                    <code className="font-mono">/tarefa Título</code> para criar
                    sem gastar tokens.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendPrompt(q)}
                      className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="h-3 w-3 text-neutral-400" />
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-neutral-900 text-white"
                        : "border border-neutral-200 bg-neutral-50 text-neutral-900"
                    )}
                  >
                    <p>{m.content}</p>
                    {m.role === "assistant" && (
                      <p className="mt-1.5 text-[10px] text-neutral-400 font-mono">
                        {m.token_count} tokens
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}
          </CardContent>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendPrompt(input);
            }}
            className="border-t border-neutral-100 p-3 flex items-center gap-2"
          >
            <Input
              placeholder="Pergunte sobre seus projetos, tarefas ou digite /tarefa ..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
            />
            <Button type="submit" disabled={sending || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
