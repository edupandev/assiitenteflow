"use client";

import * as React from "react";
import {
  FolderKanban,
  GitBranch,
  GitCommitHorizontal,
  Laptop,
  Plus,
  Copy,
  Check,
  Trash2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { formatRelativeTimeBR } from "@/lib/utils";
import type { ProjectStatus, ProjectSyncEvent } from "@/types/database";

export interface ProjectItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  last_activity_at: string | null;
  sources: {
    id: string;
    kind: "local" | "github";
    external_identifier: string;
    default_branch: string | null;
    last_commit_sha: string | null;
    last_synced_at: string | null;
  }[];
  summary:
    | {
        readme_excerpt: string | null;
        persistent_summary: string | null;
        updated_at: string;
      }[]
    | {
        readme_excerpt: string | null;
        persistent_summary: string | null;
        updated_at: string;
      }
    | null;
}

export interface SyncDeviceItem {
  id: string;
  device_name: string;
  watched_path: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

interface ProjectsClientProps {
  initialProjects: ProjectItem[];
  initialEvents: ProjectSyncEvent[];
  initialDevices: SyncDeviceItem[];
}

export function ProjectsClient({
  initialProjects,
  initialEvents,
  initialDevices,
}: ProjectsClientProps) {
  const [projects, setProjects] = React.useState<ProjectItem[]>(initialProjects);
  const [devices, setDevices] = React.useState<SyncDeviceItem[]>(initialDevices);
  const [newProjectOpen, setNewProjectOpen] = React.useState(false);
  const [newDeviceOpen, setNewDeviceOpen] = React.useState(false);

  // Novo projeto
  const [projName, setProjName] = React.useState("");
  const [projDesc, setProjDesc] = React.useState("");
  const [projSaving, setProjSaving] = React.useState(false);

  // Novo dispositivo
  const [deviceName, setDeviceName] = React.useState("");
  const [watchedPath, setWatchedPath] = React.useState("");
  const [deviceSaving, setDeviceSaving] = React.useState(false);
  const [generatedToken, setGeneratedToken] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    setProjSaving(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projName.trim(),
          description: projDesc.trim() || null,
        }),
      });
      const json = await res.json();
      if (res.ok && json.project) {
        setProjects((prev) => [
          { ...json.project, sources: [], summary: null },
          ...prev,
        ]);
        setProjName("");
        setProjDesc("");
        setNewProjectOpen(false);
      }
    } finally {
      setProjSaving(false);
    }
  }

  async function handleStatusChange(projectId: string, status: ProjectStatus) {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, status } : p))
      );
    }
  }

  async function handleCreateDevice(e: React.FormEvent) {
    e.preventDefault();
    setDeviceSaving(true);
    try {
      const res = await fetch("/api/sync/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_name: deviceName.trim(),
          watched_path: watchedPath.trim() || null,
        }),
      });
      const json = await res.json();
      if (res.ok && json.device) {
        setDevices((prev) => [json.device, ...prev]);
        setGeneratedToken(json.token);
        setDeviceName("");
        setWatchedPath("");
      }
    } finally {
      setDeviceSaving(false);
    }
  }

  async function handleDeleteDevice(id: string) {
    const res = await fetch(`/api/sync/devices?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setDevices((prev) => prev.filter((d) => d.id !== id));
    }
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Projetos
          </h1>
          <p className="text-sm text-neutral-500">
            Sincronização local de pastas, README.md e histórico Git.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setNewDeviceOpen(true)}>
            <Laptop className="h-4 w-4" />
            <span>Conectar sincronizador</span>
          </Button>
          <Button onClick={() => setNewProjectOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>Novo projeto</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Projetos */}
        <div className="lg:col-span-2 space-y-4">
          {projects.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <FolderKanban className="h-8 w-8 text-neutral-400 mx-auto" />
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    Nenhum projeto cadastrado ainda
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Conecte o sincronizador local em Node.js para detectar suas
                    pastas automaticamente ou crie um projeto manualmente.
                  </p>
                </div>
                <div className="flex justify-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setNewDeviceOpen(true)}
                  >
                    Conectar sincronizador
                  </Button>
                  <Button size="sm" onClick={() => setNewProjectOpen(true)}>
                    Criar projeto
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            projects.map((project) => {
              const summaryObj = Array.isArray(project.summary)
                ? project.summary[0]
                : project.summary;
              const localSource = project.sources?.find(
                (s) => s.kind === "local"
              );

              return (
                <Card key={project.id}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-base font-semibold text-neutral-900">
                            {project.name}
                          </h2>
                          {localSource && (
                            <Badge variant="info">Local</Badge>
                          )}
                        </div>
                        {project.description && (
                          <p className="mt-1 text-xs text-neutral-600">
                            {project.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={project.status}
                          onChange={(e) =>
                            handleStatusChange(
                              project.id,
                              e.target.value as ProjectStatus
                            )
                          }
                          className="h-8 text-xs w-32"
                        >
                          <option value="active">Ativo</option>
                          <option value="paused">Pausado</option>
                          <option value="archived">Arquivado</option>
                        </Select>
                      </div>
                    </div>

                    {summaryObj?.persistent_summary && (
                      <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3 text-xs text-neutral-700 flex items-start gap-2">
                        <FileText className="h-3.5 w-3.5 text-neutral-400 shrink-0 mt-0.5" />
                        <p className="line-clamp-3">
                          {summaryObj.persistent_summary}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500 pt-1">
                      {localSource && (
                        <>
                          <span className="font-mono truncate max-w-xs">
                            {localSource.external_identifier}
                          </span>
                          {localSource.default_branch && (
                            <span className="inline-flex items-center gap-1">
                              <GitBranch className="h-3.5 w-3.5" />
                              {localSource.default_branch}
                            </span>
                          )}
                          {localSource.last_commit_sha && (
                            <span className="inline-flex items-center gap-1 font-mono">
                              <GitCommitHorizontal className="h-3.5 w-3.5" />
                              {localSource.last_commit_sha.slice(0, 7)}
                            </span>
                          )}
                        </>
                      )}
                      {project.last_activity_at && (
                        <span>
                          Atualizado{" "}
                          {formatRelativeTimeBR(project.last_activity_at)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Coluna lateral: Dispositivos e Histórico */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <Laptop className="h-4 w-4 text-neutral-500" />
                <span>Sincronizadores locais</span>
              </CardTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setNewDeviceOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {devices.length === 0 ? (
                <p className="text-xs text-neutral-500">
                  Nenhum dispositivo conectado. Gere um token para rodar o agente
                  local em Node.js.
                </p>
              ) : (
                devices.map((dev) => (
                  <div
                    key={dev.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-neutral-100 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-neutral-900 truncate">
                        {dev.device_name}
                      </p>
                      {dev.watched_path && (
                        <p className="text-[11px] font-mono text-neutral-500 truncate mt-0.5">
                          {dev.watched_path}
                        </p>
                      )}
                      <p className="text-[11px] text-neutral-400 mt-1">
                        {dev.last_seen_at
                          ? `Último sync ${formatRelativeTimeBR(
                              dev.last_seen_at
                            )}`
                          : "Aguardando primeira sincronização"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteDevice(dev.id)}
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-600 cursor-pointer"
                      title="Revogar dispositivo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico de alterações</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {initialEvents.length === 0 ? (
                <p className="p-5 text-xs text-neutral-500">
                  Nenhum evento de sincronização registrado.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {initialEvents.map((ev) => (
                    <li key={ev.id} className="px-5 py-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-neutral-900 truncate">
                          {ev.project?.name ?? "Projeto"}
                        </span>
                        <span className="text-[11px] text-neutral-400 shrink-0">
                          {formatRelativeTimeBR(ev.occurred_at)}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600 line-clamp-2">
                        {ev.summary}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal Novo Projeto */}
      <Dialog
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        title="Novo projeto"
        description="Cadastre um projeto manualmente ou use o sincronizador local."
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700">Nome</label>
            <Input
              required
              placeholder="Ex: Sistema Radar"
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700">
              Descrição
            </label>
            <Textarea
              placeholder="Objetivo do projeto..."
              value={projDesc}
              onChange={(e) => setProjDesc(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewProjectOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={projSaving}>
              {projSaving ? "Salvando..." : "Criar projeto"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Modal Conectar Sincronizador Local */}
      <Dialog
        open={newDeviceOpen}
        onClose={() => {
          setNewDeviceOpen(false);
          setGeneratedToken(null);
        }}
        title="Conectar sincronizador local"
        description="Gere um token de dispositivo para o agente Node.js monitorar sua pasta de projetos."
      >
        {generatedToken ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <p className="font-medium">Token gerado com sucesso</p>
              <p className="mt-0.5 text-emerald-800">
                Copie agora — por segurança ele não será exibido novamente.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Input readOnly value={generatedToken} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyText(generatedToken)}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-1.5">
              <p className="text-xs font-medium text-neutral-800">
                Execute no terminal (pasta local-sync):
              </p>
              <pre className="text-[11px] font-mono text-neutral-700 overflow-x-auto whitespace-pre-wrap">
                {`node src/index.mjs --url http://localhost:3000 --token ${generatedToken} --path "C:\\Projetos" --once`}
              </pre>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setNewDeviceOpen(false);
                  setGeneratedToken(null);
                }}
              >
                Concluir
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateDevice} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-700">
                Nome do computador / dispositivo
              </label>
              <Input
                required
                placeholder="Ex: Notebook Trabalho"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-700">
                Pasta monitorada (opcional)
              </label>
              <Input
                placeholder="Ex: C:\Projetos"
                value={watchedPath}
                onChange={(e) => setWatchedPath(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewDeviceOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={deviceSaving}>
                {deviceSaving ? "Gerando..." : "Gerar token"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
