import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAIConfigured } from "@/services/ai";
import { AssistantClient } from "@/modules/assistant/assistant-client";

export default async function AssistentePage() {
  const { userId } = await requireUserContext();
  const supabase = await createClient();

  const { data: conversations } = await supabase
    .from("assistant_conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(20);

  const activeId = conversations?.[0]?.id ?? null;
  let messages: {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    token_count: number;
    created_at: string;
  }[] = [];

  if (activeId) {
    const { data: msgs } = await supabase
      .from("assistant_messages")
      .select("id, role, content, token_count, created_at")
      .eq("conversation_id", activeId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(50);
    messages = (msgs ?? []) as typeof messages;
  }

  return (
    <AssistantClient
      initialConversations={conversations ?? []}
      initialConversationId={activeId}
      initialMessages={messages}
      aiConfigured={isAIConfigured()}
    />
  );
}
