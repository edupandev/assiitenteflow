import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  is_private: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { error: "Supabase não configurado." },
      { status: 503 }
    );
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status !== undefined) {
    updates.completed_at =
      parsed.data.status === "done" ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select(
      "*, project:projects(id, name), assignee:profiles!tasks_assignee_id_fkey(id, full_name)"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ task: data });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json(
      { error: "Supabase não configurado." },
      { status: 503 }
    );
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { error } = await supabase.from("tasks").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ deleted: true });
}
