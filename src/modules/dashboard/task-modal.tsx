"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type {
  Project,
  TaskPriority,
  TaskStatus,
  TaskWithProject,
} from "@/types/database";

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  task: TaskWithProject | null;
  projects: Pick<Project, "id" | "name">[];
  onSaved: (task: TaskWithProject, isNew: boolean) => void;
  onDeleted?: (taskId: string) => void;
}

export function TaskModal({
  open,
  onClose,
  task,
  projects,
  onSaved,
  onDeleted,
}: TaskModalProps) {
  const isEditing = Boolean(task);
  const [title, setTitle] = React.useState(task?.title ?? "");
  const [description, setDescription] = React.useState(task?.description ?? "");
  const [projectId, setProjectId] = React.useState(task?.project_id ?? "");
  const [priority, setPriority] = React.useState<TaskPriority>(
    task?.priority ?? "medium"
  );
  const [status, setStatus] = React.useState<TaskStatus>(
    task?.status ?? "todo"
  );
  const [dueDate, setDueDate] = React.useState(task?.due_date ?? "");
  const [isPrivate, setIsPrivate] = React.useState(task?.is_private ?? false);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        project_id: projectId || null,
        priority,
        status,
        due_date: dueDate || null,
        is_private: isPrivate,
      };

      const res = await fetch(
        isEditing && task ? `/api/tasks/${task.id}` : "/api/tasks",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Não foi possível salvar a tarefa.");
        return;
      }

      onSaved(json.task as TaskWithProject, !isEditing);
      onClose();
    } catch {
      setError("Erro de conexão ao salvar tarefa.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Não foi possível excluir.");
        return;
      }
      onDeleted?.(task.id);
      onClose();
    } catch {
      setError("Erro de conexão ao excluir.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? "Detalhes da tarefa" : "Nova tarefa"}
      description={
        isEditing
          ? "Visualize ou atualize as informações da tarefa."
          : "Adicione uma nova tarefa ao seu painel."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {isEditing && task && (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>Origem:</span>
            <Badge variant={task.origin === "notion" ? "info" : "neutral"}>
              {task.origin === "notion" ? "Notion" : "Sistema"}
            </Badge>
            {task.external_id && (
              <span className="font-mono text-[11px] truncate">
                ID: {task.external_id}
              </span>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-700">Título</label>
          <Input
            required
            placeholder="Ex: Revisar endpoints de sincronização"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-neutral-700">
            Descrição
          </label>
          <Textarea
            placeholder="Contexto, critérios de conclusão ou observações..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700">
              Projeto associado
            </label>
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Sem projeto</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700">Prazo</label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700">
              Prioridade
            </label>
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
            >
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700">
              Status
            </label>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
            >
              <option value="todo">Pendente</option>
              <option value="in_progress">Em andamento</option>
              <option value="blocked">Bloqueada</option>
              <option value="done">Concluída</option>
            </Select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-neutral-600 cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="rounded border-neutral-300"
          />
          <span>Tarefa privada (não exibir na visão geral da equipe)</span>
        </label>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-100">
          <div>
            {isEditing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                {deleting ? "Excluindo..." : "Excluir"}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar tarefa"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
