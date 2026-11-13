export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<{ messageId: string }> {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    }
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(json.description ?? `Telegram HTTP ${res.status}`);
  }

  return { messageId: String(json.result?.message_id ?? "") };
}

export async function sendTelegramDocument(
  botToken: string,
  chatId: string,
  filename: string,
  buffer: Uint8Array,
  mimeType: string,
  caption?: string
): Promise<{ messageId: string }> {
  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) form.append("caption", caption);
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  form.append("document", new Blob([copy], { type: mimeType }), filename);

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendDocument`,
    {
      method: "POST",
      body: form,
    }
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    throw new Error(json.description ?? `Telegram HTTP ${res.status}`);
  }

  return { messageId: String(json.result?.message_id ?? "") };
}

export function formatDailyTelegramReport(params: {
  dateBR: string;
  employeeName: string;
  projects: { name: string; activities: string[]; changes: string[] }[];
  summary: string;
}): string {
  const lines: string[] = [
    "RELATÓRIO DIÁRIO",
    `Data: ${params.dateBR}`,
    "",
    `FUNCIONÁRIO: ${params.employeeName}`,
  ];

  for (const proj of params.projects) {
    lines.push("");
    lines.push(`PROJETO: ${proj.name}`);
    for (const act of proj.activities) {
      lines.push(`- ${act}`);
    }
    for (const chg of proj.changes) {
      lines.push(`- ${chg}`);
    }
  }

  lines.push("");
  lines.push("RESUMO DO DIA:");
  lines.push(params.summary);

  return lines.join("\n");
}
