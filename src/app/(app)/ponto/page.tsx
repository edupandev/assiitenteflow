import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getClosingPeriod } from "@/modules/timecard/calculations";
import { TimecardClient } from "@/modules/timecard/timecard-client";
import type { TimeRecord } from "@/types/database";

export default async function PontoPage() {
  const { userId, profile } = await requireUserContext();
  const supabase = await createClient();
  const { referenceMonth, periodStart } = getClosingPeriod();

  const [recordsRes, closingRes] = await Promise.all([
    supabase
      .from("time_records")
      .select("*")
      .eq("user_id", userId)
      .gte("work_date", periodStart)
      .lte("work_date", `${referenceMonth}-31`)
      .order("work_date", { ascending: false }),
    profile.organization_id
      ? supabase
          .from("monthly_closings")
          .select("status")
          .eq("organization_id", profile.organization_id)
          .eq("reference_month", referenceMonth)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <TimecardClient
      initialRecords={(recordsRes.data ?? []) as TimeRecord[]}
      initialMonth={referenceMonth}
      initialClosingStatus={closingRes.data?.status ?? null}
    />
  );
}
