import { requireUserContext } from "@/lib/auth";
import { getDashboardData } from "@/modules/dashboard/queries";
import { DashboardClient } from "@/modules/dashboard/dashboard-client";

export default async function DashboardPage() {
  const { userId, profile, isAdmin } = await requireUserContext();
  const data = await getDashboardData(userId, profile.organization_id, isAdmin);

  return <DashboardClient profile={profile} initialData={data} />;
}
