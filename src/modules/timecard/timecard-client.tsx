"use client";

import * as React from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  Download,
  Edit3,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import {
  cn,
  formatDateShortBR,
  formatMinutesToHours,
  getTodayBR,
} from "@/lib/utils";
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

  // Modal de edição manual
  const [manualOpen, setManualOpen] = React.useState(false);
  const [editDate, setEditDate] = React.useState(getTodayBR());
  const [clockIn, setClockIn] = React.useState("08:00");
  const [lunchOut, setLunchOut] = React.useState("12:00");
  const [lunchIn, setLunchIn] = React.useState("13:00");
  const [clockOut, setClockOut] = React.useState("17:00");
  const [justification, setJustification] = React.useState("");
  const [isHoliday, setIsHoliday] = React.useState(false);
  const [isDayOff, setIsDayOff] = React.useState(false);

  const today = getTodayBR();
  const todayRecord = records.find((r) => r.work_date === today) ?? null;

  const nextPunchLabel = !todayRecord?.clock_in
    ? "Registrar Entrada"
    : !todayRecord.lunch_out
    ? "Registrar Saída Almoço"
    : !todayRecord.lunch_in
    ? "Registrar Retorno Almoço"
    : !todayRecord.clock_out
    ? "Registrar Saída"
    : "Jornada de hoje concluída";

  const allPunchedToday = Boolean(
    todayRecord?.clock_in &&
      todayRecord?.lunch_out &&
      todayRecord?.lunch_in &&
      todayRecord?.clock_out
  );

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

  async function handlePunch() {
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
        setError(json.error ?? "Erro ao registrar ponto.");
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
        setMessage("Batida registrada com sucesso.");
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

  function openManualModal(rec?: TimeRecord) {
    if (rec) {
      setEditDate(rec.work_date);
      setClockIn(rec.clock_in ? rec.clock_in.slice(0, 5) : "08:00");
      setLunchOut(rec.lunch_out ? rec.lunch_out.slice(0, 5) : "12:00");
      setLunchIn(rec.lunch_in ? rec.lunch_in.slice(0, 5) : "13:00");
      setClockOut(rec.clock_out ? rec.clock_out.slice(0, 5) : "17:00");
      setJustification(rec.justification ?? "");
      setIsHoliday(rec.is_holiday);
      setIsDayOff(rec.is_day_off);
    } else {
      setEditDate(today);
      setClockIn("08:00");
      setLunchOut("12:00");
      setLunchIn("13:00");
      setClockOut("17:00");
      setJustification("");
      setIsHoliday(false);
      setIsDayOff(false);
    }
    setManualOpen(true);
  }

  async function handleSaveManual(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/timecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual",
          work_date: editDate,
          clock_in: clockIn || null,
          lunch_out: lunchOut || null,
          lunch_in: lunchIn || null,
          clock_out: clockOut || null,
          justification: justification.trim(),
          is_holiday: isHoliday,
          is_day_off: isDayOff,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erro ao salvar registro manual.");
        return;
      }
      setManualOpen(false);
      setMessage("Registro manual salvo com justificativa.");
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
      "Justificativa",
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
        `"${(r.justification ?? "").replace(/"/g, '""')}"`,
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
          <Button
            variant="outline"
            onClick={() => openManualModal()}
            disabled={loading || closingStatus === "closed"}
          >
            <Edit3 className="h-4 w-4" />
            <span>Ajuste manual</span>
          </Button>
          <Button variant="outline" onClick={handleExportCsv}>
            <Download className="h-4 w-4" />
            <span>CSV</span>
          </Button>
        </div>
      </div>

      {closingStatus === "closed" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          O período <strong>{month}</strong> (01 a 23) está fechado. Edições
          estão bloqueadas até reabertura administrativa.
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

      {/* Cartão de batida do dia */}
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
            {[
              { label: "Entrada", value: todayRecord?.clock_in ?? null },
              {
                label: "Saída almoço",
                value: todayRecord?.lunch_out ?? null,
              },
              { label: "Retorno", value: todayRecord?.lunch_in ?? null },
              { label: "Saída", value: todayRecord?.clock_out ?? null },
            ].map((slot) => (
              <div
                key={slot.label}
                className="rounded-lg border border-neutral-100 bg-neutral-50/70 p-3"
              >
                <p className="text-[11px] text-neutral-500">{slot.label}</p>
                <p className="mt-1 text-base font-semibold font-mono text-neutral-900">
                  {shortTime(slot.value)}
                </p>
              </div>
            ))}
          </div>

          <Button
            onClick={handlePunch}
            disabled={loading || allPunchedToday}
            className="sm:w-52"
          >
            {nextPunchLabel}
          </Button>
        </CardContent>
      </Card>

      {/* Histórico / Calendário do mês */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-neutral-500" />
            <span>Registros de {month}</span>
          </CardTitle>
          <span className="text-xs font-mono text-neutral-600">
            Total no mês: {formatMinutesToHours(totalMonthMinutes)}
          </span>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-neutral-100">
          {records.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              Nenhum registro encontrado para {month}. Registre sua batida ou
              use &ldquo;Preencher estimados&rdquo;.
            </div>
          ) : (
            records.map((rec) => (
              <div
                key={rec.id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-neutral-50/60"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900 font-mono">
                      {formatDateShortBR(rec.work_date)}
                    </span>
                    <Badge variant={SOURCE_VARIANT[rec.source]}>
                      {SOURCE_LABEL[rec.source]}
                    </Badge>
                    {rec.is_holiday && (
                      <Badge variant="outline">Feriado</Badge>
                    )}
                    {rec.is_day_off && <Badge variant="outline">Folga</Badge>}
                  </div>
                  {rec.justification && (
                    <p className="text-xs text-neutral-500">
                      {rec.justification}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-neutral-700">
                  <span>
                    {shortTime(rec.clock_in)} — {shortTime(rec.lunch_out)} |{" "}
                    {shortTime(rec.lunch_in)} — {shortTime(rec.clock_out)}
                  </span>
                  <span
                    className={cn(
                      "font-semibold px-2 py-0.5 rounded bg-neutral-100"
                    )}
                  >
                    {formatMinutesToHours(rec.worked_minutes)}
                  </span>
                  {closingStatus !== "closed" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openManualModal(rec)}
                      className="h-7 px-2 font-sans"
                    >
                      Editar
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Registro ou ajuste manual de ponto"
        description="Alterações manuais exigem justificativa para trilha de auditoria."
      >
        <form onSubmit={handleSaveManual} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700">Data</label>
            <Input
              type="date"
              required
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-neutral-600">
                Entrada
              </label>
              <Input
                type="time"
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-neutral-600">
                Almoço saída
              </label>
              <Input
                type="time"
                value={lunchOut}
                onChange={(e) => setLunchOut(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-neutral-600">
                Retorno
              </label>
              <Input
                type="time"
                value={lunchIn}
                onChange={(e) => setLunchIn(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-neutral-600">
                Saída
              </label>
              <Input
                type="time"
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-neutral-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isHoliday}
                onChange={(e) => setIsHoliday(e.target.checked)}
              />
              <span>Feriado (100%)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isDayOff}
                onChange={(e) => setIsDayOff(e.target.checked)}
              />
              <span>Folga trabalhada (100%)</span>
            </label>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700">
              Justificativa obrigatória
            </label>
            <Textarea
              required
              placeholder="Ex: Esqueci de registrar a saída do almoço..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setManualOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              Salvar ajuste
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
