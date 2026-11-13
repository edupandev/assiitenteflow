import { createHash } from "node:crypto";
import type { TaskPriority, TaskStatus } from "@/types/database";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export interface NotionTaskRecord {
  externalId: string;
  externalUrl: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  lastEditedTime: string;
  syncHash: string;
}

type NotionProperty = {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  status?: { name: string } | null;
  select?: { name: string } | null;
  checkbox?: boolean;
  date?: { start: string } | null;
};

type NotionPage = {
  id: string;
  url: string;
  last_edited_time: string;
  properties: Record<string, NotionProperty>;
};

function notionHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function normalizeStatus(raw?: string | null, checked?: boolean): TaskStatus {
  if (checked === true) return "done";
  const val = (raw ?? "").toLowerCase().trim();
  if (["done", "concluída", "concluido", "completed", "finalizada"].includes(val)) {
    return "done";
  }
  if (
    ["in progress", "em andamento", "doing", "progress", "fazendo"].includes(val)
  ) {
    return "in_progress";
  }
  if (["blocked", "bloqueada", "bloqueado", "impedida"].includes(val)) {
    return "blocked";
  }
  return "todo";
}

function normalizePriority(raw?: string | null): TaskPriority {
  const val = (raw ?? "").toLowerCase().trim();
  if (["urgent", "urgente", "crítica", "critica"].includes(val)) return "urgent";
  if (["high", "alta"].includes(val)) return "high";
  if (["low", "baixa"].includes(val)) return "low";
  return "medium";
}

function extractText(prop?: NotionProperty): string {
  if (!prop) return "";
  if (prop.type === "title" && prop.title) {
    return prop.title.map((t) => t.plain_text).join("").trim();
  }
  if (prop.type === "rich_text" && prop.rich_text) {
    return prop.rich_text.map((t) => t.plain_text).join("").trim();
  }
  return "";
}

function findProperty(
  properties: Record<string, NotionProperty>,
  candidates: string[],
  fallbackType?: string
): NotionProperty | undefined {
  for (const key of Object.keys(properties)) {
    if (candidates.includes(key.toLowerCase())) {
      return properties[key];
    }
  }
  if (fallbackType) {
    return Object.values(properties).find((p) => p.type === fallbackType);
  }
  return undefined;
}

export async function testNotionDatabase(apiKey: string, databaseId: string) {
  const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
    method: "GET",
    headers: notionHeaders(apiKey),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message ?? `Erro Notion HTTP ${res.status}`);
  }

  return {
    id: data.id as string,
    title:
      (data.title as { plain_text: string }[] | undefined)
        ?.map((t) => t.plain_text)
        .join("") || "Database Notion",
  };
}

export async function fetchNotionDatabaseTasks(
  apiKey: string,
  databaseId: string
): Promise<NotionTaskRecord[]> {
  const res = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
    method: "POST",
    headers: notionHeaders(apiKey),
    body: JSON.stringify({ page_size: 100 }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message ?? `Erro Notion HTTP ${res.status}`);
  }

  const pages = (data.results ?? []) as NotionPage[];

  return pages.map((page) => {
    const props = page.properties ?? {};
    const titleProp = findProperty(
      props,
      ["title", "título", "titulo", "name", "nome", "tarefa"],
      "title"
    );
    const descProp = findProperty(props, [
      "description",
      "descrição",
      "descricao",
      "detalhes",
    ]);
    const statusProp = findProperty(props, ["status", "estado"], "status");
    const doneCheckProp = findProperty(props, ["done", "concluída", "concluida"]);
    const priorityProp = findProperty(props, ["priority", "prioridade"]);
    const dateProp = findProperty(
      props,
      ["due", "due date", "prazo", "data", "date"],
      "date"
    );

    const title = extractText(titleProp) || "Tarefa sem título (Notion)";
    const description = extractText(descProp) || null;
    const rawStatus =
      statusProp?.status?.name ?? statusProp?.select?.name ?? null;
    const status = normalizeStatus(rawStatus, doneCheckProp?.checkbox);
    const rawPriority =
      priorityProp?.select?.name ?? priorityProp?.status?.name ?? null;
    const priority = normalizePriority(rawPriority);
    const dueDate = dateProp?.date?.start
      ? dateProp.date.start.slice(0, 10)
      : null;

    const syncHash = createHash("sha256")
      .update(
        JSON.stringify({ title, description, status, priority, dueDate })
      )
      .digest("hex");

    return {
      externalId: page.id,
      externalUrl: page.url,
      title,
      description,
      status,
      priority,
      dueDate,
      lastEditedTime: page.last_edited_time,
      syncHash,
    };
  });
}
