const SAO_PAULO_TZ = "America/Sao_Paulo";

export interface TimeInputs {
  clock_in: string | null;
  lunch_out: string | null;
  lunch_in: string | null;
  clock_out: string | null;
}

export interface ScheduleConfig {
  entry_time: string;
  lunch_out_time: string;
  lunch_in_time: string;
  exit_time: string;
  workdays: number[]; // 1 = Seg .. 7 = Dom
  holidays: string[]; // YYYY-MM-DD
}

export interface OvertimeRuleConfig {
  monthly_salary: number;
  monthly_divisor: number;
  daily_contract_minutes: number;
  overtime_50_pct: number;
  overtime_100_pct: number;
}

export interface DayOvertimeBreakdown {
  work_date: string;
  worked_minutes: number;
  normal_minutes: number;
  overtime_50_minutes: number;
  overtime_100_minutes: number;
  balance_minutes: number;
  source: "real" | "manual" | "estimated";
  is_holiday: boolean;
  is_day_off: boolean;
}

export interface OvertimeSummary {
  total_worked_minutes: number;
  total_normal_minutes: number;
  total_overtime_50_minutes: number;
  total_overtime_100_minutes: number;
  balance_minutes: number;
  hourly_rate: number;
  estimated_overtime_value: number;
  days: DayOvertimeBreakdown[];
}

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  entry_time: "08:00:00",
  lunch_out_time: "12:00:00",
  lunch_in_time: "13:00:00",
  exit_time: "17:00:00",
  workdays: [1, 2, 3, 4, 5],
  holidays: [],
};

export const DEFAULT_OVERTIME_RULE: OvertimeRuleConfig = {
  monthly_salary: 0,
  monthly_divisor: 220,
  daily_contract_minutes: 480,
  overtime_50_pct: 50,
  overtime_100_pct: 100,
};

export function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.trim().split(":");
  if (parts.length < 2) return null;
  const hours = Number.parseInt(parts[0], 10);
  const mins = Number.parseInt(parts[1], 10);
  if (Number.isNaN(hours) || Number.isNaN(mins)) return null;
  return hours * 60 + mins;
}

export function calculateWorkedMinutes(input: TimeInputs): number {
  const cIn = parseTimeToMinutes(input.clock_in);
  const lOut = parseTimeToMinutes(input.lunch_out);
  const lIn = parseTimeToMinutes(input.lunch_in);
  const cOut = parseTimeToMinutes(input.clock_out);

  if (cIn === null) return 0;

  if (lOut !== null && lIn !== null && cOut !== null) {
    const morning = Math.max(0, lOut - cIn);
    const afternoon = Math.max(0, cOut - lIn);
    return morning + afternoon;
  }

  if (lOut !== null && lIn === null && cOut === null) {
    return Math.max(0, lOut - cIn);
  }

  if (cOut !== null && lOut === null && lIn === null) {
    return Math.max(0, cOut - cIn);
  }

  return 0;
}

/**
 * Retorna período de fechamento padrão: dia 01 até dia 23 do mês (horário de Brasília).
 */
export function getClosingPeriod(referenceMonth?: string): {
  referenceMonth: string;
  periodStart: string;
  periodEnd: string;
} {
  let month = referenceMonth;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: SAO_PAULO_TZ,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "2026";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    month = `${y}-${m}`;
  }

  return {
    referenceMonth: month,
    periodStart: `${month}-01`,
    periodEnd: `${month}-23`,
  };
}

/**
 * Converte YYYY-MM-DD para dia da semana ISO (1=Seg .. 7=Dom).
 */
export function getIsoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map((n) => Number.parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  return day === 0 ? 7 : day;
}

export function enumerateDates(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  const [sy, sm, sd] = startDate.split("-").map((n) => Number.parseInt(n, 10));
  const [ey, em, ed] = endDate.split("-").map((n) => Number.parseInt(n, 10));
  let cur = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);

  while (cur <= end) {
    const dt = new Date(cur);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    result.push(`${y}-${m}-${d}`);
    cur += 86_400_000;
  }

  return result;
}

export function isEligibleWorkday(
  dateStr: string,
  schedule: Pick<ScheduleConfig, "workdays" | "holidays">
): boolean {
  if (schedule.holidays.includes(dateStr)) return false;
  const weekday = getIsoWeekday(dateStr);
  return schedule.workdays.includes(weekday);
}

export function calculateOvertimeSummary(
  records: {
    work_date: string;
    worked_minutes: number;
    source: "real" | "manual" | "estimated";
    is_holiday: boolean;
    is_day_off: boolean;
  }[],
  rule: OvertimeRuleConfig
): OvertimeSummary {
  const dailyContract = Math.max(1, rule.daily_contract_minutes);
  const divisor = Math.max(1, rule.monthly_divisor);
  const hourlyRate =
    rule.monthly_salary > 0 ? Number((rule.monthly_salary / divisor).toFixed(4)) : 0;

  let totalWorked = 0;
  let totalNormal = 0;
  let totalOt50 = 0;
  let totalOt100 = 0;
  let balance = 0;

  const days: DayOvertimeBreakdown[] = records
    .slice()
    .sort((a, b) => a.work_date.localeCompare(b.work_date))
    .map((rec) => {
      const worked = Math.max(0, rec.worked_minutes);
      totalWorked += worked;

      let normal = 0;
      let ot50 = 0;
      let ot100 = 0;
      let dayBalance = 0;

      if (rec.is_holiday || rec.is_day_off) {
        ot100 = worked;
        dayBalance = worked;
      } else {
        normal = Math.min(worked, dailyContract);
        ot50 = Math.max(0, worked - dailyContract);
        dayBalance = worked - dailyContract;
      }

      totalNormal += normal;
      totalOt50 += ot50;
      totalOt100 += ot100;
      balance += dayBalance;

      return {
        work_date: rec.work_date,
        worked_minutes: worked,
        normal_minutes: normal,
        overtime_50_minutes: ot50,
        overtime_100_minutes: ot100,
        balance_minutes: dayBalance,
        source: rec.source,
        is_holiday: rec.is_holiday,
        is_day_off: rec.is_day_off,
      };
    });

  const ot50Value =
    (totalOt50 / 60) * hourlyRate * (1 + rule.overtime_50_pct / 100);
  const ot100Value =
    (totalOt100 / 60) * hourlyRate * (1 + rule.overtime_100_pct / 100);

  return {
    total_worked_minutes: totalWorked,
    total_normal_minutes: totalNormal,
    total_overtime_50_minutes: totalOt50,
    total_overtime_100_minutes: totalOt100,
    balance_minutes: balance,
    hourly_rate: Number(hourlyRate.toFixed(2)),
    estimated_overtime_value: Number((ot50Value + ot100Value).toFixed(2)),
    days,
  };
}
