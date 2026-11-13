import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { formatDateShortBR, formatMinutesToHours } from "@/lib/utils";
import type { OvertimeSummary } from "@/modules/timecard/calculations";
import type { TimeRecord } from "@/types/database";

export interface IndividualReportInput {
  employeeName: string;
  employeeEmail: string;
  referenceMonth: string;
  periodStart: string;
  periodEnd: string;
  records: TimeRecord[];
  overtime: OvertimeSummary;
  completedTasksCount: number;
  pendingTasksCount: number;
}

export function buildIndividualPdfBuffer(input: IndividualReportInput): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = 48;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("PulseWork — Relatório Individual de Jornada e Produtividade", 40, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Funcionário: ${input.employeeName} (${input.employeeEmail})`, 40, y);
  y += 15;
  doc.text(
    `Período: ${formatDateShortBR(input.periodStart)} até ${formatDateShortBR(
      input.periodEnd
    )} (${input.referenceMonth})`,
    40,
    y
  );
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Resumo de Jornada e Horas Extras", 40, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const summaryLines = [
    `Horas trabalhadas: ${formatMinutesToHours(input.overtime.total_worked_minutes)}`,
    `Horas normais: ${formatMinutesToHours(input.overtime.total_normal_minutes)}`,
    `Horas extras 50%: ${formatMinutesToHours(input.overtime.total_overtime_50_minutes)}`,
    `Horas extras 100%: ${formatMinutesToHours(input.overtime.total_overtime_100_minutes)}`,
    `Saldo do período: ${formatMinutesToHours(input.overtime.balance_minutes)}`,
    `Valor estimado de extras: R$ ${input.overtime.estimated_overtime_value.toFixed(2)}`,
    `Tarefas concluídas / pendentes: ${input.completedTasksCount} / ${input.pendingTasksCount}`,
  ];
  for (const line of summaryLines) {
    doc.text(line, 40, y);
    y += 14;
  }

  y += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Registros Diários", 40, y);
  y += 16;

  doc.setFont("courier", "normal");
  doc.setFontSize(9);

  for (const rec of input.records) {
    if (y > 780) {
      doc.addPage();
      y = 48;
    }
    const t = (v: string | null) => (v ? v.slice(0, 5) : "--:--");
    const row = `${formatDateShortBR(rec.work_date)} | ${t(rec.clock_in)}-${t(
      rec.lunch_out
    )} ${t(rec.lunch_in)}-${t(rec.clock_out)} | ${formatMinutesToHours(
      rec.worked_minutes
    )} | ${rec.source.toUpperCase()}`;
    doc.text(row, 40, y);
    y += 13;
  }

  const arrayBuffer = doc.output("arraybuffer");
  return new Uint8Array(arrayBuffer);
}

export function buildIndividualXlsxBuffer(input: IndividualReportInput): Uint8Array {
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    ["Funcionário", input.employeeName],
    ["E-mail", input.employeeEmail],
    ["Referência", input.referenceMonth],
    [
      "Período",
      `${formatDateShortBR(input.periodStart)} até ${formatDateShortBR(
        input.periodEnd
      )}`,
    ],
    [
      "Horas Trabalhadas",
      formatMinutesToHours(input.overtime.total_worked_minutes),
    ],
    ["Horas Normais", formatMinutesToHours(input.overtime.total_normal_minutes)],
    [
      "Extras 50%",
      formatMinutesToHours(input.overtime.total_overtime_50_minutes),
    ],
    [
      "Extras 100%",
      formatMinutesToHours(input.overtime.total_overtime_100_minutes),
    ],
    ["Saldo", formatMinutesToHours(input.overtime.balance_minutes)],
    [
      "Valor Estimado Extras (R$)",
      input.overtime.estimated_overtime_value.toFixed(2),
    ],
    ["Tarefas Concluídas", input.completedTasksCount],
    ["Tarefas Pendentes", input.pendingTasksCount],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

  const recordRows = input.records.map((r) => ({
    Data: formatDateShortBR(r.work_date),
    Entrada: r.clock_in?.slice(0, 5) ?? "",
    SaidaAlmoco: r.lunch_out?.slice(0, 5) ?? "",
    RetornoAlmoco: r.lunch_in?.slice(0, 5) ?? "",
    Saida: r.clock_out?.slice(0, 5) ?? "",
    HorasTrabalhadas: formatMinutesToHours(r.worked_minutes),
    Origem: r.source,
    Justificativa: r.justification ?? "",
  }));

  const wsRecords = XLSX.utils.json_to_sheet(recordRows);
  XLSX.utils.book_append_sheet(wb, wsRecords, "Ponto");

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Uint8Array(out);
}
