import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

const updateEmployeeSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["admin", "employee"]).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!caller?.organization_id || caller.role !== "admin") {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;
  if (parsed.data.is_active !== undefined)
    updates.is_active = parsed.data.is_active;

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", parsed.data.user_id)
    .eq("organization_id", caller.organization_id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ employee: data });
}
