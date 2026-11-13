"use client";

import * as React from "react";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { TaskModal } from "@/modules/dashboard/task-modal";
import { cn, formatDateShortBR, formatRelativeTimeBR } from "@/lib/utils";
import type {
  Project,
  TaskPriority,
  TaskStatus,
  TaskWithProject,
} from "@/types/database";

interface NotionConfigSummary {
  hasApiKey: boolean;
  databaseId: string | null;
  databaseTitle: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

interface TaskSyncEventItem {
  id: string;
  direction: string;
  status: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface TasksClientProps {
  initialTasks: TaskWithProject[];
  projects: Pick<Project, "id" | "name">[];
  notionConfig: NotionConfigSummary;
  syncEvents: TaskSyncEventItem[];
}

export function TasksClient({
  initialTasks,
  projects,
  notionConfig: initialNotion,
  syncEvents,
}: TasksClientProps) {
  const [tasks, setTasks] = React.useState<TaskWithProject[]>(initialTasks);
  const [notion, setNotion] = React.useState<NotionConfigSummary>(initialNotion);

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [priorityFilter, setPriorityFilter] = React.useState("all");
  const [originFilter, setOriginFilter] = React.useState("all");
  const [projectFilter, setProjectFilter] = React.useState("all");

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<TaskWithProject | null>(
    null
  );
  const [notionModalOpen, setNotionModalOpen] = React.useState(false);
  const [dbIdInput, setDbIdInput] = React.useState(
    initialNotion.databaseId ?? ""
  );
  const [savingNotion, setSavingNotion] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [syncMessage, setSyncMessage] = React.useState<string | null>(null);
  const [syncError, setSyncError] = React.useState<string | null>(null);

  const filteredTasks = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (
        q &&
        !t.title.toLowerCase().includes(q) &&
        !(t.description ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter)
        return false;
      if (originFilter !== "all" && t.origin !== originFilter) return false;
      if (projectFilter !== "all" && t.project_id !== projectFilter)
        return false;
      return true;
    });
  }, [
    tasks,
    search,
    statusFilter,
    priorityFilter,
    originFilter,
    projectFilter,
  ]);

  async function patchTask(
    taskId: string,
    patch: Partial<Pick<TaskWithProject, "status" | "priority">>
  ) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return;
    const json = await res.json();
    if (json.task) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? (json.task as TaskWithProject) : t))
      );
    }
  }

  async function handleSaveNotion(e: React.FormEvent) {
    e.preventDefault();
    setSavingNotion(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/integrations/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database_id: dbIdInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSyncError(json.error ?? "Erro ao conectar database do Notion.");
        return;
      }
      const cfg = json.integration?.config as {
        database_id?: string;
        database_title?: string;
      };
      setNotion((prev) => ({
        ...prev,
        databaseId: cfg?.database_id ?? dbIdInput.trim(),
        databaseTitle: cfg?.database_title ?? "Notion Database",
        lastError: null,
      }));
      setNotionModalOpen(false);
    } finally {
      setSavingNotion(false);
    }
  }

  async function handleSyncNotion() {
    setSyncing(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/tasks/sync-notion", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setSyncError(json.error ?? "Falha ao sincronizar com o Notion.");
        return;
      }
      setSyncMessage(
        `Notion sincronizado: ${json.created} criada(s), ${json.updated} atualizada(s), ${json.conflicts} conflito(s).`
      );
      // Recarrega lista de tarefas
      const tasksRes = await fetch("/api/tasks");
      const tasksJson = await tasksRes.json();
      if (tasksRes.ok && tasksJson.tasks) {
        setTasks(tasksJson.tasks);
      }
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Tarefas
          </h1>
          <p className="text-sm text-neutral-500">
            Gerenciamento completo e sincronização oficial com o Notion.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setNotionModalOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
            <span>
              {notion.databaseId ? "Notion configurado" : "Configurar Notion"}
            </span>
          </Button>

          <Button
            variant="outline"
            disabled={syncing || !notion.databaseId}
            onClick={handleSyncNotion}
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            <span>{syncing ? "Sincronizando..." : "Sincronizar Notion"}</span>
          </Button>

          <Button
            onClick={() => {
              setEditingTask(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Nova tarefa</span>
          </Button>
        </div>
      </div>

      {syncMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          {syncMessage}
        </div>
      )}

      {syncError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {syncError}
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-1">
            <Search className="h-4 w-4 text-neutral-400 absolute left-3 top-2.5" />
            <Input
              placeholder="Buscar tarefa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos os status</option>
            <option value="todo">Pendente</option>
            <option value="in_progress">Em andamento</option>
            <option value="blocked">Bloqueada</option>
            <option value="done">Concluída</option>
          </Select>

          <Select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">Todas as prioridades</option>
            <option value="urgent">Urgente</option>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </Select>

          <Select
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value)}
          >
            <option value="all">Todas as origens</option>
            <option value="system">Sistema</option>
            <option value="notion">Notion</option>
          </Select>

          <Select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">Todos os projetos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {/* Lista de Tarefas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            {filteredTasks.length} tarefa(s) encontrada(s)
          </CardTitle>
          {notion.databaseTitle && (
            <span className="text-xs text-neutral-500">
              Notion: {notion.databaseTitle}
              {notion.lastSyncAt &&
                ` • sync ${formatRelativeTimeBR(notion.lastSyncAt)}`}
            </span>
          )}
        </CardHeader>
        <CardContent className="p-0 divide-y divide-neutral-100">
          {filteredTasks.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              Nenhuma tarefa encontrada com os filtros selecionados.
            </div>
          ) : (
            filteredTasks.map((task) => {
              const isDone = task.status === "done";
              return (
                <div
                  key={task.id}
                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-neutral-50/70"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        patchTask(task.id, {
                          status: isDone ? "todo" : "done",
                        })
                      }
                      className="mt-0.5 text-neutral-400 hover:text-neutral-900 shrink-0 cursor-pointer"
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTask(task);
                            setModalOpen(true);
                          }}
                          className={cn(
                            "text-sm font-medium text-left hover:underline cursor-pointer truncate",
                            isDone
                              ? "line-through text-neutral-400"
                              : "text-neutral-900"
                          )}
                        >
                          {task.title}
                        </button>
                        {task.external_url && (
                          <a
                            href={task.external_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-neutral-400 hover:text-neutral-700 shrink-0"
                            title="Abrir no Notion"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        <span>{task.project?.name ?? "Sem projeto"}</span>
                        <span>•</span>
                        <span>{formatDateShortBR(task.due_date)}</span>
                        <Badge
                          variant={
                            task.origin === "notion" ? "info" : "neutral"
                          }
                        >
                          {task.origin === "notion" ? "Notion" : "Sistema"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pl-7 sm:pl-0 shrink-0">
                    <select
                      value={task.priority}
                      onChange={(e) =>
                        patchTask(task.id, {
                          priority: e.target.value as TaskPriority,
                        })
                      }
                      className="h-7 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700 cursor-pointer"
                    >
                      <option value="low">Baixa</option>
                      <option value="medium">Média</option>
                      <option value="high">Alta</option>
                      <option value="urgent">Urgente</option>
                    </select>

                    <select
                      value={task.status}
                      onChange={(e) =>
                        patchTask(task.id, {
                          status: e.target.value as TaskStatus,
                        })
                      }
                      className="h-7 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700 cursor-pointer"
                    >
                      <option value="todo">Pendente</option>
                      <option value="in_progress">Em andamento</option>
                      <option value="blocked">Bloqueada</option>
                      <option value="done">Concluída</option>
                    </select>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {syncEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico recente de sincronização Notion</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-neutral-100">
            {syncEvents.map((ev) => (
              <div
                key={ev.id}
                className="px-5 py-2.5 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      ev.direction === "conflict" ? "warning" : "neutral"
                    }
                  >
                    {ev.direction}
                  </Badge>
                  <span className="text-neutral-700">
                    {String(ev.details?.reason ?? ev.details?.action ?? ev.status)}
                  </span>
                </div>
                <span className="text-neutral-400">
                  {formatRelativeTimeBR(ev.created_at)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <TaskModal
        key={editingTask?.id ?? (modalOpen ? "new-task" : "closed")}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editingTask}
        projects={projects}
        onSaved={(saved, isNew) => {
          if (isNew) setTasks((prev) => [saved, ...prev]);
          else
            setTasks((prev) =>
              prev.map((t) => (t.id === saved.id ? saved : t))
            );
        }}
        onDeleted={(id) => setTasks((prev) => prev.filter((t) => t.id !== id))}
      />

      <Dialog
        open={notionModalOpen}
        onClose={() => setNotionModalOpen(false)}
        title="Configurar Database do Notion"
        description="Informe o ID do database do Notion compartilhado com sua integração."
      >
        <form onSubmit={handleSaveNotion} className="space-y-4">
          {!notion.hasApiKey && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              A variável <code className="font-mono">NOTION_API_KEY</code>{" "}
              precisa estar definida no servidor (.env.local ou Vercel).
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700">
              Notion Database ID
            </label>
            <Input
              required
              placeholder="Ex: 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
              value={dbIdInput}
              onChange={(e) => setDbIdInput(e.target.value)}
            />
            <p className="text-[11px] text-neutral-500">
              Copie o código de 32 caracteres da URL do seu database no Notion e
              compartilhe a página com a integração.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNotionModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={savingNotion}>
              {savingNotion ? "Validando..." : "Salvar e testar"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
