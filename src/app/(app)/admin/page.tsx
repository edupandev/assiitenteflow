import { redirect } from "next/navigation";
import { requireUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminClient } from "@/modules/admin/admin-client";
import type { Profile } from "@/types/database";

export default async function AdminPage() {
  const { userId, profile, isAdmin } = await requireUserContext();
  if (!isAdmin) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const orgId = profile.organization_id;

  const [employeesRes, deliveriesRes, jobsRes] = orgId
    ? await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .eq("organization_id", orgId)
          .order("full_name", { ascending: true }),
        supabase
          .from("telegram_deliveries")
          .select("id, delivery_type, status, error_message, created_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(15),
        supabase
          .from("background_jobs")
          .select("id, job_type, status, attempts, last_error, created_at")
          .order("created_at", { ascending: false })
          .limit(15),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  return (
    <AdminClient
      currentUserId={userId}
      initialEmployees={(employeesRes.data ?? []) as Profile[]}
      deliveries={
        (deliveriesRes.data ?? []) as {
          id: string;
          delivery_type: string;
          status: string;
          error_message: string | null;
          created_at: string;
        }[]
      }
      jobs={
        (jobsRes.data ?? []) as {
          id: string;
          job_type: string;
          status: string;
          attempts: number;
          last_error: string | null;
          created_at: string;
        }[]
      }
    />
  );
}
