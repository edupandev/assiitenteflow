import { redirect } from "next/navigation";
import { createClient, isSupabaseServerConfigured } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export interface UserContext {
  userId: string;
  email: string;
  profile: Profile;
  isAdmin: boolean;
}

export async function requireUserContext(): Promise<UserContext> {
  if (!isSupabaseServerConfigured()) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile || !profile.is_active) {
    redirect("/login?error=inactive");
  }

  return {
    userId: user.id,
    email: user.email ?? profile.email,
    profile,
    isAdmin: profile.role === "admin",
  };
}
