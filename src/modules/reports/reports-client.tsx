"use client";

import * as React from "react";
import { Download, FileBarChart2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateShortBR } from "@/lib/utils";
import type { Profile, Project, ReportSummary } from "@/types/database";

interface ReportsClientProps {
  isAdmin: boolean;
  currentUserId: string;
  initialMonth: string;
  employees: Pick<Profile, "id" | "full_name">[];
  projects: Pick<Project, "id" | "name">[];
  recentReports: ReportSummary[];
}

export function ReportsClient({
  isAdmin,
  currentUserId,
  initialMonth,
  employees,
  projects,
  recentReports,
}: ReportsClientProps) {
  const [reportType, setReportType] = React.useState("monthly");
  const [month, setMonth] = React.useState(initialMonth);
  const [employeeId, setEmployeeId] = React.useState(currentUserId);
  const [projectId, setProjectId] = React.useState("all");

  function exportFile(format: "pdf" | "xlsx") {
    const params = new URLSearchParams({
      format,
      month,
      type: reportType,
      user_id: employeeId,
    });
    if (projectId !== "all") params.set("project_id", projectId);
    window.open(`/api/reports/export?${params.toString()}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Relatórios
          </h1>
          <p className="text-sm text-neutral-500">
            Exporte relatórios individuais em PDF e Excel (.xlsx).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => exportFile("xlsx")}>
            <FileSpreadsheet className="h-4 w-4" />
            <span>Exportar Excel</span>
          </Button>
          <Button onClick={() => exportFile("pdf")}>
            <Download className="h-4 w-4" />
            <span>Exportar PDF</span>
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros do relatório</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700">Tipo</label>
            <Select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              <option value="daily">Relatório diário</option>
              <option value="monthly">Fechamento mensal (01 a 23)</option>
              <option value="productivity">Produtividade</option>
              <option value="projects">Projetos</option>
              <option value="timecard">Controle de ponto</option>
              <option value="overtime">Horas extras</option>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700">
              Mês de referência
            </label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>

          {isAdmin && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700">
                Funcionário
              </label>
              <Select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700">
              Projeto
            </label>
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="all">Todos os projetos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de relatórios gerados */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileBarChart2 className="h-4 w-4 text-neutral-500" />
            <span>Relatórios gerados automaticamente</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-neutral-100">
          {recentReports.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              Nenhum fechamento automático registrado ainda. Use os botões acima
              para exportar PDF ou Excel sob demanda.
            </div>
          ) : (
            recentReports.map((rep) => (
              <div
                key={rep.id}
                className="px-5 py-3 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="neutral">{rep.report_type}</Badge>
                  <span className="text-neutral-700">
                    {formatDateShortBR(rep.period_start)} até{" "}
                    {formatDateShortBR(rep.period_end)}
                  </span>
                </div>
                <span className="text-neutral-400">
                  {formatDateShortBR(rep.created_at)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
