import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const SAO_PAULO_TZ = "America/Sao_Paulo";

/**
 * Returns today's date string (YYYY-MM-DD) in America/Sao_Paulo timezone.
 */
export function getTodayBR(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function formatCurrentDateBR(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function getGreetingBR(name?: string | null): string {
  const hourStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TZ,
    hour: "numeric",
    hour12: false,
  }).format(new Date());

  const hour = Number.parseInt(hourStr, 10);
  let greeting = "Olá";
  if (hour >= 5 && hour < 12) greeting = "Bom dia";
  else if (hour >= 12 && hour < 18) greeting = "Boa tarde";
  else greeting = "Boa noite";

  const firstName = name?.trim().split(/\s+/)[0];
  return firstName ? `${greeting}, ${firstName}` : greeting;
}

export function formatDateShortBR(dateStr: string | null | undefined): string {
  if (!dateStr) return "Sem prazo";
  const [year, month, day] = dateStr.split("T")[0].split("-");
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}

export function formatMinutesToHours(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

export function formatRelativeTimeBR(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `há ${diffDays}d`;
}
