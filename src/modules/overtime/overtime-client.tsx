"use client";

import * as React from "react";
import { Lock, Unlock, Settings, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { cn, formatDateShortBR, formatMinutesToHours } from "@/lib/utils";
import type {
  OvertimeRuleConfig,
  OvertimeSummary,
} from "@/modules/timecard/calculations";

interface ClosingRow {
  id: string;
  reference_month: string;
  period_start: string;
  period_end: string;
  status: "draft" | "closed" | "reopened";
  closed_at: string | null;
  reopened_reason: string | null;
}

interface OvertimeClientProps {
  isAdmin: boolean;
  initialMonth: string;
  initialPeriodStart: string;
  initialPeriodEnd: string;
  initialRule: OvertimeRuleConfig;
  hasConfiguredRule: boolean;
  initialSummary: OvertimeSummary;
  initialClosing: ClosingRow | null;
}

export function OvertimeClient({
  isAdmin,
  initialMonth,
  initialPeriodStart,
  initialRule,
  hasConfiguredRule,
  initialSummary,
  initialClosing,
}: OvertimeClientProps) {
  const [month, setMonth] = React.useState(initialMonth);
  const [summary, setSummary] = React.useState<OvertimeSummary>(initialSummary);
  const [rule, setRule] = React.useState<OvertimeRuleConfig>(initialRule);
  const [configured, setConfigured] = React.useState(hasConfiguredRule);
  const [closing, setClosing] = React.useState<ClosingRow | null>(
    initialClosing
  );

  const [ruleOpen, setRuleOpen] = React.useState(false);
  const [reopenOpen, setReopenOpen] = React.useState(false);
  const [reopenReason, setReopenReason] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Form da regra
  const [salary, setSalary] = React.useState(String(initialRule.monthly_salary));
  const [divisor, setDivisor] = React.useState(
    String(initialRule.monthly_divisor)
  );
  const [dailyMins, setDailyMins] = React.useState(
    String(initialRule.daily_contract_minutes)
  );
  const [pct50, setPct50] = React.useState(String(initialRule.overtime_50_pct));
  const [pct100, setPct100] = React.useState(
    String(initialRule.overtime_100_pct)
  );

  async function loadMonth(targetMonth: string) {
    setMonth(targetMonth);
    setLoading(true);
    setError(null);
    try {
      const [otRes, clRes] = await Promise.all([
        fetch(`/api/overtime?month=${targetMonth}`),
        fetch("/api/closings"),
      ]);
      const otJson = await otRes.json();
      const clJson = await clRes.json();
      if (otRes.ok) {
        setSummary(otJson.summary);
        setRule(otJson.rule);
        setConfigured(otJson.hasConfiguredRule);
      }
      if (clRes.ok) {
        const match = (clJson.closings ?? []).find(
          (c: ClosingRow) => c.reference_month === targetMonth
        );
        setClosing(match ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRule(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/overtime", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: null,
          monthly_salary: Number(salary) || 0,
          monthly_divisor: Number(divisor) || 220,
          daily_contract_minutes: Number(dailyMins) || 480,
          overtime_50_pct: Number(pct50) || 50,
          overtime_100_pct: Number(pct100) || 100,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro ao salvar regra.");
        return;
      }
      setRuleOpen(false);
      setMessage("Regra global de horas extras atualizada.");
      await loadMonth(month);
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseMonth() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/closings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", reference_month: month }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro ao executar fechamento.");
        return;
      }
      setClosing(json.closing);
      setMessage(`Fechamento do mês ${month} (01 a 23) concluído.`);
      await loadMonth(month);
    } finally {
      setLoading(false);
    }
  }

  async function handleReopenMonth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/closings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reopen",
          reference_month: month,
          reason: reopenReason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro ao reabrir fechamento.");
        return;
      }
      setClosing(json.closing);
      setReopenOpen(false);
      setReopenReason("");
      setMessage(`Fechamento ${month} reaberto com registro de auditoria.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Horas extras e fechamento
          </h1>
          <p className="text-sm text-neutral-500">
            Período padrão de fechamento: {formatDateShortBR(initialPeriodStart)}{" "}
            até {formatDateShortBR(`${month}-23`)} (dia 23).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => loadMonth(e.target.value)}
            className="w-40"
          />

          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setRuleOpen(true)}>
                <Settings className="h-4 w-4" />
                <span>Regras</span>
              </Button>

              {closing?.status === "closed" ? (
                <Button
                  variant="outline"
                  onClick={() => setReopenOpen(true)}
                  disabled={loading}
                >
                  <Unlock className="h-4 w-4" />
                  <span>Reabrir fechamento</span>
                </Button>
              ) : (
                <Button onClick={handleCloseMonth} disabled={loading}>
                  <Lock className="h-4 w-4" />
                  <span>Fechar mês (dia 23)</span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {!configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Nenhuma regra salarial personalizada foi configurada ainda (usando
          jornada padrão de 8h, divisor 220, adicionais 50%/100% e salário R$
          0,00).
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-neutral-500">Horas normais</p>
            <p className="mt-2 text-xl font-semibold font-mono text-neutral-900">
              {formatMinutesToHours(summary.total_normal_minutes)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-neutral-500">Extras {rule.overtime_50_pct}%</p>
            <p className="mt-2 text-xl font-semibold font-mono text-neutral-900">
              {formatMinutesToHours(summary.total_overtime_50_minutes)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-neutral-500">Extras {rule.overtime_100_pct}%</p>
            <p className="mt-2 text-xl font-semibold font-mono text-neutral-900">
              {formatMinutesToHours(summary.total_overtime_100_minutes)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-neutral-500">Saldo mensal</p>
            <p
              className={cn(
                "mt-2 text-xl font-semibold font-mono",
                summary.balance_minutes >= 0
                  ? "text-emerald-700"
                  : "text-amber-700"
              )}
            >
              {summary.balance_minutes > 0 ? "+" : ""}
              {formatMinutesToHours(summary.balance_minutes)}
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs text-neutral-500">Valor estimado</p>
            <p className="mt-2 text-xl font-semibold font-mono text-neutral-900">
              {summary.estimated_overtime_value.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status do fechamento */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-neutral-500" />
            <span className="font-medium text-neutral-800">
              Fechamento {month} (01 a 23):
            </span>
            <Badge
              variant={
                closing?.status === "closed"
                  ? "success"
                  : closing?.status === "reopened"
                  ? "warning"
                  : "neutral"
              }
            >
              {closing?.status === "closed"
                ? "Fechado"
                : closing?.status === "reopened"
                ? "Reaberto"
                : "Em aberto"}
            </Badge>
          </div>
          <span className="text-neutral-500">
            Regra ativa: divisor {rule.monthly_divisor} • contrato{" "}
            {formatMinutesToHours(rule.daily_contract_minutes)}/dia
          </span>
        </CardContent>
      </Card>

      {/* Histórico por dia */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico por dia (01 a 23 de {month})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-neutral-100">
          {summary.days.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              Nenhum registro de ponto neste período.
            </div>
          ) : (
            summary.days.map((d) => (
              <div
                key={d.work_date}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-neutral-900">
                    {formatDateShortBR(d.work_date)}
                  </span>
                  <Badge
                    variant={
                      d.source === "real"
                        ? "success"
                        : d.source === "manual"
                        ? "info"
                        : "warning"
                    }
                  >
                    {d.source === "real"
                      ? "Real"
                      : d.source === "manual"
                      ? "Manual"
                      : "Estimado"}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-4 font-mono text-neutral-700">
                  <span>Trab: {formatMinutesToHours(d.worked_minutes)}</span>
                  <span>Normal: {formatMinutesToHours(d.normal_minutes)}</span>
                  <span>50%: {formatMinutesToHours(d.overtime_50_minutes)}</span>
                  <span>100%: {formatMinutesToHours(d.overtime_100_minutes)}</span>
                  <span
                    className={cn(
                      "font-semibold",
                      d.balance_minutes >= 0
                        ? "text-emerald-700"
                        : "text-amber-700"
                    )}
                  >
                    Saldo: {d.balance_minutes > 0 ? "+" : ""}
                    {formatMinutesToHours(d.balance_minutes)}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Modal de Regras (Admin) */}
      <Dialog
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        title="Configurar regras de horas extras"
        description="Define salário base, divisor mensal e percentuais adicionais da organização."
      >
        <form onSubmit={handleSaveRule} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700">
                Salário mensal (R$)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700">
                Divisor mensal (ex: 220)
              </label>
              <Input
                type="number"
                min="1"
                value={divisor}
                onChange={(e) => setDivisor(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700">
                Jornada diária (minutos)
              </label>
              <Input
                type="number"
                min="60"
                value={dailyMins}
                onChange={(e) => setDailyMins(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700">
                Adicional padrão (%)
              </label>
              <Input
                type="number"
                step="1"
                min="0"
                value={pct50}
                onChange={(e) => setPct50(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-700">
                Adicional feriado/folga (%)
              </label>
              <Input
                type="number"
                step="1"
                min="0"
                value={pct100}
                onChange={(e) => setPct100(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRuleOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              Salvar regra
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Modal Reabertura (Admin) */}
      <Dialog
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        title="Reabrir fechamento mensal"
        description="A reabertura administrativa fica registrada na auditoria."
      >
        <form onSubmit={handleReopenMonth} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700">
              Motivo da reabertura
            </label>
            <Input
              required
              placeholder="Ex: Correção de batida manual pendente"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReopenOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              Confirmar reabertura
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
