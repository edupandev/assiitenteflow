import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateWorkedMinutes,
  calculateOvertimeSummary,
  getClosingPeriod,
  isEligibleWorkday,
  DEFAULT_SCHEDULE,
} from "../src/modules/timecard/calculations.ts";

test("calculateWorkedMinutes calcula jornada padrão de 8h (480 min)", () => {
  const mins = calculateWorkedMinutes({
    clock_in: "08:00:00",
    lunch_out: "12:00:00",
    lunch_in: "13:00:00",
    clock_out: "17:00:00",
  });
  assert.equal(mins, 480);
});

test("calculateWorkedMinutes calcula hora extra corretamente", () => {
  const mins = calculateWorkedMinutes({
    clock_in: "08:00",
    lunch_out: "12:00",
    lunch_in: "13:00",
    clock_out: "19:00",
  });
  assert.equal(mins, 600);
});

test("getClosingPeriod retorna período 01 a 23 do mês", () => {
  const period = getClosingPeriod("2026-11");
  assert.deepEqual(period, {
    referenceMonth: "2026-11",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-23",
  });
});

test("isEligibleWorkday respeita fins de semana e feriados", () => {
  // 2026-11-13 é sexta-feira
  assert.equal(isEligibleWorkday("2026-11-13", DEFAULT_SCHEDULE), true);
  // 2026-11-14 é sábado
  assert.equal(isEligibleWorkday("2026-11-14", DEFAULT_SCHEDULE), false);
  // 2026-11-15 é domingo
  assert.equal(isEligibleWorkday("2026-11-15", DEFAULT_SCHEDULE), false);
  // Feriado em dia útil
  assert.equal(
    isEligibleWorkday("2026-11-20", {
      workdays: [1, 2, 3, 4, 5],
      holidays: ["2026-11-20"],
    }),
    false
  );
});

test("calculateOvertimeSummary calcula 50%, 100%, saldo e valor estimado", () => {
  const summary = calculateOvertimeSummary(
    [
      {
        work_date: "2026-11-02",
        worked_minutes: 600, // 8h normal + 2h a 50%
        source: "real",
        is_holiday: false,
        is_day_off: false,
      },
      {
        work_date: "2026-11-03",
        worked_minutes: 240, // 4h em feriado a 100%
        source: "manual",
        is_holiday: true,
        is_day_off: false,
      },
    ],
    {
      monthly_salary: 2200, // R$ 10/h com divisor 220
      monthly_divisor: 220,
      daily_contract_minutes: 480,
      overtime_50_pct: 50,
      overtime_100_pct: 100,
    }
  );

  assert.equal(summary.total_worked_minutes, 840);
  assert.equal(summary.total_normal_minutes, 480);
  assert.equal(summary.total_overtime_50_minutes, 120);
  assert.equal(summary.total_overtime_100_minutes, 240);
  assert.equal(summary.balance_minutes, 360);
  assert.equal(summary.hourly_rate, 10);
  // 2h * 10 * 1.5 = 30; 4h * 10 * 2.0 = 80 -> total 110
  assert.equal(summary.estimated_overtime_value, 110);
});
