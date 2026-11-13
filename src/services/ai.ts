export type AIProvider = "gemini" | "openai" | "openai-compatible" | "anthropic";

export interface AICompletionRequest {
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
}

export interface AICompletionResult {
  content: string;
  tokensUsed: number;
  provider: string;
  model: string;
}

export function isAIConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

export async function generateAICompletion(
  req: AICompletionRequest
): Promise<AICompletionResult> {
  const provider = (process.env.AI_PROVIDER ?? "gemini") as AIProvider;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL ?? "gemini-2.5-flash";
  const maxTokens = Math.min(2000, Math.max(200, req.maxTokens ?? 900));

  if (!apiKey) {
    throw new Error("AI_API_KEY não configurada no servidor.");
  }

  if (provider === "gemini") {
    const contents = req.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.systemPrompt }] },
          contents,
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.3,
          },
        }),
      }
    );

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        json.error?.message ?? `Erro Gemini HTTP ${res.status}`
      );
    }

    const text =
      json.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? "";
    const tokensUsed =
      Number(json.usageMetadata?.totalTokenCount ?? 0) ||
      Math.ceil((req.systemPrompt.length + text.length) / 4);

    return { content: text, tokensUsed, provider, model };
  }

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: req.systemPrompt,
        messages: req.messages,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error?.message ?? `Erro Anthropic HTTP ${res.status}`);
    }

    const text =
      json.content
        ?.map((c: { text?: string }) => c.text ?? "")
        .join("") ?? "";
    const tokensUsed =
      Number(json.usage?.input_tokens ?? 0) +
      Number(json.usage?.output_tokens ?? 0);

    return { content: text, tokensUsed, provider, model };
  }

  // OpenAI ou OpenAI-compatible (Groq, OpenRouter)
  const baseUrl = (
    process.env.AI_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/+$/, "");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [
        { role: "system", content: req.systemPrompt },
        ...req.messages,
      ],
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message ?? `Erro OpenAI HTTP ${res.status}`);
  }

  const text = json.choices?.[0]?.message?.content ?? "";
  const tokensUsed = Number(json.usage?.total_tokens ?? 0);

  return { content: text, tokensUsed, provider, model };
}
