"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bot,
  CheckCircle2,
  Circle,
  Clock,
  FolderKanban,
  GitCommitHorizontal,
  Plus,
  ArrowUpRight,
  Users,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  cn,
  formatCurrentDateBR,
  formatDateShortBR,
  formatMinutesToHours,
  formatRelativeTimeBR,
  getGreetingBR,
  getTodayBR,
} from "@/lib/utils";
import type {
  Profile,
  TaskPriority,
  TaskStatus,
  TaskWithProject,
} from "@/types/database";
import type { DashboardData } from "./queries";
import { TaskModal } from "./task-modal";

interface DashboardClientProps {
  profile: Profile;
  initialData: DashboardData;
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

const PRIORITY_VARIANT: Record<
  TaskPriority,
  "neutral" | "info" | "warning" | "danger"
> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "danger",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Pendente",
  in_progress: "Em andamento",
  blocked: "Bloqueada",
  done: "Concluída",
};

export function DashboardClient({
  profile,
  initialData,
}: DashboardClientProps) {
  const [tasks, setTasks] = React.useState<TaskWithProject[]>(initialData.tasks);
  const [viewMode, setViewMode] = React.useState<"mine" | "team">("mine");
  const [showCompleted, setShowCompleted] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<TaskWithProject | null>(
    null
  );
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  // Admin filters
  const [filterEmployee, setFilterEmployee] = React.useState("all");
  const [filterProject, setFilterProject] = React.useState("all");
  const [filterStatus, setFilterStatus] = React.useState("all");
  const [filterPeriod, setFilterPeriod] = React.useState("all");

  const today = getTodayBR();
  const greeting = getGreetingBR(profile.full_name);
  const dateLabel = formatCurrentDateBR();

  const pendingCount = tasks.filter(
    (t) => t.status === "todo" || t.status === "blocked"
  ).length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const activeProjectsCount = initialData.projects.length;

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const completedTasks = tasks.filter((t) => t.status === "done");

  const overdueTasks = activeTasks.filter(
    (t) => t.due_date && t.due_date < today
  );
  const todayTasks = activeTasks.filter((t) => t.due_date === today);
  const upcomingTasks = activeTasks.filter(
    (t) => t.due_date && t.due_date > today
  );
  const undatedTasks = activeTasks.filter((t) => !t.due_date);

  async function patchTask(
    taskId: string,
    patch: Partial<Pick<TaskWithProject, "status" | "priority">>
  ) {
    setUpdatingId(taskId);
    try {
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
    } finally {
      setUpdatingId(null);
    }
  }

  function handleSavedTask(saved: TaskWithProject, isNew: boolean) {
    if (isNew) {
      setTasks((prev) => [saved, ...prev]);
    } else {
      setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
    }
  }

  function handleDeletedTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  function openNewTask() {
    setEditingTask(null);
    setModalOpen(true);
  }

  function openTaskDetails(task: TaskWithProject) {
    setEditingTask(task);
    setModalOpen(true);
  }

  // Admin filtered team tasks
  const filteredTeamTasks = React.useMemo(() => {
    if (!initialData.adminOverview) return [];
    return initialData.adminOverview.teamTasks.filter((t) => {
      if (filterEmployee !== "all" && t.assignee_id !== filterEmployee) {
        return false;
      }
      if (filterProject !== "all" && t.project_id !== filterProject) {
        return false;
      }
      if (filterStatus !== "all" && t.status !== filterStatus) {
        return false;
      }
      if (filterPeriod === "today" && t.due_date !== today) return false;
      if (filterPeriod === "overdue" && (!t.due_date || t.due_date >= today))
        return false;
      return true;
    });
  }, [
    initialData.adminOverview,
    filterEmployee,
    filterProject,
    filterStatus,
    filterPeriod,
    today,
  ]);

  const taskGroups = [
    { key: "today", label: "Hoje", items: todayTasks },
    { key: "overdue", label: "Atrasadas", items: overdueTasks },
    { key: "upcoming", label: "Próximas", items: upcomingTasks },
    { key: "undated", label: "Sem prazo", items: undatedTasks },
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {greeting}
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500 capitalize">
            {dateLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {profile.role === "admin" && initialData.adminOverview && (
            <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("mine")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  viewMode === "mine"
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:text-neutral-900"
                )}
              >
                Minha produtividade
              </button>
              <button
                type="button"
                onClick={() => setViewMode("team")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  viewMode === "team"
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:text-neutral-900"
                )}
              >
                <Users className="h-3.5 w-3.5" />
                Visão da equipe
              </button>
            </div>
          )}

          <Link href="/assistente">
            <Button variant="outline">
              <Bot className="h-4 w-4" />
              <span>Assistente IA</span>
            </Button>
          </Link>

          <Button onClick={openNewTask}>
            <Plus className="h-4 w-4" />
            <span>Adicionar tarefa</span>
          </Button>
        </div>
      </div>

      {viewMode === "mine" ? (
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-neutral-500">
                  Tarefas pendentes
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
                  {pendingCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-neutral-500">
                  Em andamento
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
                  {inProgressCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-neutral-500">
                  Concluídas
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
                  {doneCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-neutral-500">
                  Projetos ativos
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
                  {activeProjectsCount}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Minhas Tarefas */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>Minhas tarefas</CardTitle>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Organizadas por Hoje, Atrasadas, Próximas e Sem prazo
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCompleted((v) => !v)}
                      className="text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer"
                    >
                      {showCompleted
                        ? "Ocultar concluídas"
                        : `Ver concluídas (${completedTasks.length})`}
                    </button>
                    <Link
                      href="/tarefas"
                      className="inline-flex items-center gap-1 text-xs font-medium text-neutral-700 hover:text-neutral-900"
                    >
                      <span>Ver todas</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </CardHeader>

                <CardContent className="p-0 divide-y divide-neutral-100">
                  {activeTasks.length === 0 && !showCompleted ? (
                    <div className="p-8 text-center">
                      <p className="text-sm font-medium text-neutral-700">
                        Nenhuma tarefa ativa no momento
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Crie uma nova tarefa ou sincronize seu workspace do Notion.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-4"
                        onClick={openNewTask}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Criar primeira tarefa
                      </Button>
                    </div>
                  ) : (
                    <>
                      {taskGroups.map((group) =>
                        group.items.length === 0 ? null : (
                          <div key={group.key} className="py-3">
                            <div className="px-5 pb-2 flex items-center justify-between">
                              <span
                                className={cn(
                                  "text-xs font-semibold uppercase tracking-wider",
                                  group.key === "overdue"
                                    ? "text-red-600"
                                    : "text-neutral-500"
                                )}
                              >
                                {group.label}
                              </span>
                              <span className="text-xs text-neutral-400">
                                {group.items.length}
                              </span>
                            </div>

                            <div className="divide-y divide-neutral-100">
                              {group.items.map((task) => (
                                <TaskRow
                                  key={task.id}
                                  task={task}
                                  disabled={updatingId === task.id}
                                  onToggleDone={() =>
                                    patchTask(task.id, {
                                      status:
                                        task.status === "done"
                                          ? "todo"
                                          : "done",
                                    })
                                  }
                                  onChangePriority={(priority) =>
                                    patchTask(task.id, { priority })
                                  }
                                  onChangeStatus={(status) =>
                                    patchTask(task.id, { status })
                                  }
                                  onOpen={() => openTaskDetails(task)}
                                />
                              ))}
                            </div>
                          </div>
                        )
                      )}

                      {showCompleted && completedTasks.length > 0 && (
                        <div className="py-3 bg-neutral-50/50">
                          <div className="px-5 pb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                              Concluídas
                            </span>
                            <span className="text-xs text-neutral-400">
                              {completedTasks.length}
                            </span>
                          </div>
                          <div className="divide-y divide-neutral-100">
                            {completedTasks.map((task) => (
                              <TaskRow
                                key={task.id}
                                task={task}
                                disabled={updatingId === task.id}
                                onToggleDone={() =>
                                  patchTask(task.id, { status: "todo" })
                                }
                                onChangePriority={(priority) =>
                                  patchTask(task.id, { priority })
                                }
                                onChangeStatus={(status) =>
                                  patchTask(task.id, { status })
                                }
                                onOpen={() => openTaskDetails(task)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Coluna lateral: Resumo de Jornada + Atividades Recentes */}
            <div className="space-y-6">
              {/* Resumo de Jornada */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-neutral-500" />
                    <span>Resumo de jornada</span>
                  </CardTitle>
                  <Link
                    href="/ponto"
                    className="text-xs font-medium text-neutral-700 hover:text-neutral-900 inline-flex items-center gap-1"
                  >
                    <span>Ponto</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3">
                      <p className="text-[11px] text-neutral-500">
                        Trabalhado hoje
                      </p>
                      <p className="mt-1 text-lg font-semibold text-neutral-900 font-mono">
                        {formatMinutesToHours(initialData.todayMinutes)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3">
                      <p className="text-[11px] text-neutral-500">
                        Saldo do mês
                      </p>
                      <p
                        className={cn(
                          "mt-1 text-lg font-semibold font-mono",
                          initialData.monthBalanceMinutes >= 0
                            ? "text-emerald-700"
                            : "text-amber-700"
                        )}
                      >
                        {initialData.monthBalanceMinutes > 0 ? "+" : ""}
                        {formatMinutesToHours(initialData.monthBalanceMinutes)}
                      </p>
                    </div>
                  </div>
                  <Link href="/ponto" className="block">
                    <Button variant="outline" className="w-full" size="sm">
                      Acessar controle de ponto
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Atividades Recentes */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-neutral-500" />
                    <span>Atividades recentes</span>
                  </CardTitle>
                  <Link
                    href="/projetos"
                    className="text-xs font-medium text-neutral-700 hover:text-neutral-900 inline-flex items-center gap-1"
                  >
                    <span>Projetos</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </CardHeader>
                <CardContent className="p-0">
                  {initialData.recentActivities.length === 0 ? (
                    <div className="p-5 text-xs text-neutral-500">
                      Nenhuma alteração recente registrada nos projetos. Conecte
                      um repositório GitHub ou o sincronizador local na aba
                      Projetos.
                    </div>
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {initialData.recentActivities.map((act) => (
                        <li key={act.id} className="px-5 py-3 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-neutral-900 truncate">
                              {act.project?.name ?? "Projeto"}
                            </span>
                            <span className="text-[11px] text-neutral-400 shrink-0">
                              {formatRelativeTimeBR(act.occurred_at)}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-600 line-clamp-2">
                            {act.summary}
                          </p>
                          {act.commit_sha && (
                            <div className="flex items-center gap-1 text-[11px] text-neutral-400 font-mono">
                              <GitCommitHorizontal className="h-3 w-3" />
                              <span>{act.commit_sha.slice(0, 7)}</span>
                              {act.branch && <span>• {act.branch}</span>}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : (
        /* Visão do Administrador */
        initialData.adminOverview && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-neutral-500">
                    Funcionários ativos
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-neutral-900">
                    {initialData.adminOverview.employees.length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-neutral-500">
                    Projetos ativos da equipe
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-neutral-900">
                    {initialData.adminOverview.activeProjectsCount}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-neutral-500">
                    Pendências da equipe
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-neutral-900">
                    {
                      initialData.adminOverview.teamTasks.filter(
                        (t) => t.status !== "done"
                      ).length
                    }
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-neutral-500">
                    Relatórios recentes
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-neutral-900">
                    {initialData.adminOverview.recentReports.length}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Filtros */}
            <Card>
              <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Select
                  value={filterEmployee}
                  onChange={(e) => setFilterEmployee(e.target.value)}
                >
                  <option value="all">Todos os funcionários</option>
                  {initialData.adminOverview.employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </option>
                  ))}
                </Select>

                <Select
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value)}
                >
                  <option value="all">Todos os projetos</option>
                  {initialData.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>

                <Select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">Todos os status</option>
                  <option value="todo">Pendente</option>
                  <option value="in_progress">Em andamento</option>
                  <option value="blocked">Bloqueada</option>
                  <option value="done">Concluída</option>
                </Select>

                <Select
                  value={filterPeriod}
                  onChange={(e) => setFilterPeriod(e.target.value)}
                >
                  <option value="all">Qualquer prazo</option>
                  <option value="today">Vencem hoje</option>
                  <option value="overdue">Atrasadas</option>
                </Select>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Tarefas públicas da equipe</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {filteredTeamTasks.length === 0 ? (
                    <div className="p-6 text-xs text-neutral-500">
                      Nenhuma tarefa pública encontrada com os filtros atuais.
                    </div>
                  ) : (
                    <div className="divide-y divide-neutral-100">
                      {filteredTeamTasks.map((t) => (
                        <div
                          key={t.id}
                          className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-neutral-900 truncate">
                              {t.title}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {t.assignee?.full_name ?? "Responsável"} •{" "}
                              {t.project?.name ?? "Sem projeto"} •{" "}
                              {formatDateShortBR(t.due_date)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={PRIORITY_VARIANT[t.priority]}>
                              {PRIORITY_LABEL[t.priority]}
                            </Badge>
                            <Badge variant="outline">
                              {STATUS_LABEL[t.status]}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Status das integrações</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {initialData.adminOverview.integrations.length === 0 ? (
                      <p className="text-xs text-neutral-500">
                        Nenhuma integração configurada ainda.
                      </p>
                    ) : (
                      initialData.adminOverview.integrations.map((intg) => (
                        <div
                          key={intg.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="capitalize font-medium text-neutral-800">
                            {intg.provider}
                          </span>
                          <Badge
                            variant={
                              intg.status === "connected"
                                ? "success"
                                : intg.status === "error"
                                ? "danger"
                                : "neutral"
                            }
                          >
                            {intg.status === "connected"
                              ? "Conectada"
                              : intg.status === "error"
                              ? "Erro"
                              : "Desconectada"}
                          </Badge>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Atividades da equipe</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {initialData.adminOverview.teamActivities.length === 0 ? (
                      <p className="p-5 text-xs text-neutral-500">
                        Nenhuma atividade recente da equipe.
                      </p>
                    ) : (
                      <ul className="divide-y divide-neutral-100">
                        {initialData.adminOverview.teamActivities.map((a) => (
                          <li key={a.id} className="px-5 py-3">
                            <p className="text-xs font-medium text-neutral-900">
                              {a.project?.name ?? "Projeto"}
                            </p>
                            <p className="text-xs text-neutral-600 line-clamp-2 mt-0.5">
                              {a.summary}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )
      )}

      <TaskModal
        key={editingTask?.id ?? (modalOpen ? "new-task" : "closed")}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editingTask}
        projects={initialData.projects}
        onSaved={handleSavedTask}
        onDeleted={handleDeletedTask}
      />
    </div>
  );
}

interface TaskRowProps {
  task: TaskWithProject;
  disabled: boolean;
  onToggleDone: () => void;
  onChangePriority: (priority: TaskPriority) => void;
  onChangeStatus: (status: TaskStatus) => void;
  onOpen: () => void;
}

function TaskRow({
  task,
  disabled,
  onToggleDone,
  onChangePriority,
  onChangeStatus,
  onOpen,
}: TaskRowProps) {
  const isDone = task.status === "done";

  return (
    <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-neutral-50/80 transition-colors">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <button
          type="button"
          disabled={disabled}
          onClick={onToggleDone}
          aria-label={isDone ? "Reabrir tarefa" : "Concluir tarefa"}
          className="mt-0.5 text-neutral-400 hover:text-neutral-900 shrink-0 cursor-pointer"
        >
          {isDone ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className={cn(
              "text-left text-sm font-medium hover:underline cursor-pointer truncate block w-full",
              isDone ? "line-through text-neutral-400" : "text-neutral-900"
            )}
          >
            {task.title}
          </button>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span>{task.project?.name ?? "Sem projeto"}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDateShortBR(task.due_date)}
            </span>
            <Badge variant={task.origin === "notion" ? "info" : "neutral"}>
              {task.origin === "notion" ? "Notion" : "Sistema"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pl-7 sm:pl-0 shrink-0">
        <select
          aria-label="Prioridade"
          disabled={disabled}
          value={task.priority}
          onChange={(e) => onChangePriority(e.target.value as TaskPriority)}
          className={cn(
            "h-7 rounded-md border px-2 text-xs font-medium bg-white cursor-pointer",
            PRIORITY_VARIANT[task.priority] === "danger"
              ? "border-red-200 text-red-700"
              : PRIORITY_VARIANT[task.priority] === "warning"
              ? "border-amber-200 text-amber-700"
              : "border-neutral-200 text-neutral-700"
          )}
        >
          <option value="low">Baixa</option>
          <option value="medium">Média</option>
          <option value="high">Alta</option>
          <option value="urgent">Urgente</option>
        </select>

        <select
          aria-label="Status"
          disabled={disabled}
          value={task.status}
          onChange={(e) => onChangeStatus(e.target.value as TaskStatus)}
          className="h-7 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700 cursor-pointer"
        >
          <option value="todo">Pendente</option>
          <option value="in_progress">Em andamento</option>
          <option value="blocked">Bloqueada</option>
          <option value="done">Concluída</option>
        </select>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpen}
          className="h-7 px-2 text-xs"
        >
          Editar
        </Button>
      </div>
    </div>
  );
}
