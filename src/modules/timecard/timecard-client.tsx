"use client";

import * as React from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  Download,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  cn,
  formatDateShortBR,
  formatMinutesToHours,
  getTodayBR,
} from "@/lib/utils";
import {
  enumerateDates,
  getIsoWeekday,
} from "@/modules/timecard/calculations";
import type { TimeRecord, TimeRecordSource } from "@/types/database";

interface TimecardClientProps {
  initialRecords: TimeRecord[];
  initialMonth: string;
  initialClosingStatus: string | null;
}

const SOURCE_LABEL: Record<TimeRecordSource, string> = {
  real: "Real",
  manual: "Manual",
  estimated: "Estimado",
};

const SOURCE_VARIANT: Record<TimeRecordSource, "success" | "info" | "warning"> =
  {
    real: "success",
    manual: "info",
    estimated: "warning",
  };

function shortTime(t: string | null): string {
  if (!t) return "--:--";
  return t.slice(0, 5);
}

function getMonthRange(ym: string): { start: string; end: string } {
  const [yStr, mStr] = ym.split("-");
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${ym}-01`,
    end: `${ym}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function TimecardClient({
  initialRecords,
  initialMonth,
  initialClosingStatus,
}: TimecardClientProps) {
  const [month, setMonth] = React.useState(initialMonth);
  const [records, setRecords] = React.useState<TimeRecord[]>(initialRecords);
  const [closingStatus, setClosingStatus] = React.useState<string | null>(
    initialClosingStatus
  );
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const today = getTodayBR();
  const todayRecord = records.find((r) => r.work_date === today) ?? null;
  const hasExitToday = Boolean(todayRecord?.clock_out);

  async function loadMonth(targetMonth: string) {
    setMonth(targetMonth);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/timecard?month=${targetMonth}`);
      const json = await res.json();
      if (res.ok) {
        setRecords(json.records ?? []);
        setClosingStatus(json.closing?.status ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePunchExit() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/timecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "punch", work_date: today }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro ao registrar saída.");
        return;
      }
      if (json.record) {
        setRecords((prev) => {
          const exists = prev.some((r) => r.id === json.record.id);
          if (exists) {
            return prev.map((r) => (r.id === json.record.id ? json.record : r));
          }
          return [json.record, ...prev];
        });
        setMessage("Saída registrada com sucesso.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoFill() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/timecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_fill", reference_month: month }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro no preenchimento automático.");
        return;
      }
      setMessage(
        `${json.filled} dia(s) elegível(is) preenchido(s) como estimado(s).`
      );
      await loadMonth(month);
    } finally {
      setLoading(false);
    }
  }

  function handleExportCsv() {
    const header = [
      "Data",
      "Entrada",
      "Saida Almoco",
      "Retorno Almoco",
      "Saida",
      "Minutos Trabalhados",
      "Origem",
    ].join(",");

    const rows = records.map((r) =>
      [
        r.work_date,
        shortTime(r.clock_in),
        shortTime(r.lunch_out),
        shortTime(r.lunch_in),
        shortTime(r.clock_out),
        r.worked_minutes,
        SOURCE_LABEL[r.source],
      ].join(",")
    );

    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ponto-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalMonthMinutes = records.reduce(
    (sum, r) => sum + r.worked_minutes,
    0
  );

  // Gera a listagem completa de todos os dias do mês selecionado
  const allMonthDays = React.useMemo(() => {
    const { start, end } = getMonthRange(month);
    const byDate = new Map(records.map((r) => [r.work_date, r]));
    return enumerateDates(start, end)
      .reverse()
      .map((dateStr) => {
        const rec = byDate.get(dateStr) ?? null;
        const weekday = getIsoWeekday(dateStr);
        const isWeekend = weekday === 6 || weekday === 7;
        return { dateStr, rec, isWeekend };
      });
  }, [month, records]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Controle de ponto
          </h1>
          <p className="text-sm text-neutral-500">
            Jornada padrão 08:00–12:00 / 13:00–17:00 (8h) • Horário de Brasília.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => loadMonth(e.target.value)}
            className="w-40"
          />
          <Button
            variant="outline"
            onClick={handleAutoFill}
            disabled={loading || closingStatus === "closed"}
          >
            <Sparkles className="h-4 w-4" />
            <span>Preencher estimados</span>
          </Button>
          <Button variant="outline" onClick={handleExportCsv}>
            <Download className="h-4 w-4" />
            <span>CSV</span>
          </Button>
        </div>
      </div>

      {closingStatus === "closed" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          O período <strong>{month}</strong> (01 a 23) está fechado. Novos
          registros estão bloqueados até reabertura administrativa.
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

      {/* Cartão de hoje: somente botão de Saída */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-neutral-500" />
            <span>Registro de hoje ({formatDateShortBR(today)})</span>
          </CardTitle>
          <span className="text-xs font-mono text-neutral-600">
            Total hoje: {formatMinutesToHours(todayRecord?.worked_minutes ?? 0)}
          </span>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3">
              <p className="text-[11px] text-neutral-500">Entrada</p>
              <p className="mt-1 text-base font-semibold font-mono text-neutral-900">
                {shortTime(todayRecord?.clock_in ?? "08:00")}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3">
              <p className="text-[11px] text-neutral-500">Saída almoço</p>
              <p className="mt-1 text-base font-semibold font-mono text-neutral-900">
                {shortTime(todayRecord?.lunch_out ?? "12:00")}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3">
              <p className="text-[11px] text-neutral-500">Retorno</p>
              <p className="mt-1 text-base font-semibold font-mono text-neutral-900">
                {shortTime(todayRecord?.lunch_in ?? "13:00")}
              </p>
            </div>
            <div className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3">
              <p className="text-[11px] text-neutral-500">Saída</p>
              <p className="mt-1 text-base font-semibold font-mono text-neutral-900">
                {shortTime(todayRecord?.clock_out ?? null)}
              </p>
            </div>
          </div>

          <Button
            onClick={handlePunchExit}
            disabled={loading || hasExitToday || closingStatus === "closed"}
            className="sm:w-52"
          >
            {hasExitToday ? "Saída registrada" : "Registrar Saída"}
          </Button>
        </CardContent>
      </Card>

      {/* Listagem completa do mês sempre visível */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-neutral-500" />
            <span>Listagem completa de {month}</span>
          </CardTitle>
          <span className="text-xs font-mono text-neutral-600">
            Total no mês: {formatMinutesToHours(totalMonthMinutes)}
          </span>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-neutral-100">
          {allMonthDays.map(({ dateStr, rec, isWeekend }) => (
            <div
              key={dateStr}
              className={cn(
                "px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2",
                dateStr === today
                  ? "bg-neutral-50"
                  : isWeekend && !rec
                  ? "bg-neutral-50/40 text-neutral-400"
                  : "hover:bg-neutral-50/60"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium font-mono text-neutral-900">
                  {formatDateShortBR(dateStr)}
                </span>
                {rec ? (
                  <Badge variant={SOURCE_VARIANT[rec.source]}>
                    {SOURCE_LABEL[rec.source]}
                  </Badge>
                ) : isWeekend ? (
                  <Badge variant="outline">Fim de semana</Badge>
                ) : (
                  <Badge variant="neutral">Sem registro</Badge>
                )}
                {dateStr === today && <Badge variant="info">Hoje</Badge>}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-neutral-700">
                <span>
                  {rec
                    ? `${shortTime(rec.clock_in)} — ${shortTime(
                        rec.lunch_out
                      )} | ${shortTime(rec.lunch_in)} — ${shortTime(
                        rec.clock_out
                      )}`
                    : "--:-- — --:-- | --:-- — --:--"}
                </span>
                <span className="font-semibold px-2 py-0.5 rounded bg-neutral-100 min-w-[64px] text-center">
                  {formatMinutesToHours(rec?.worked_minutes ?? 0)}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
