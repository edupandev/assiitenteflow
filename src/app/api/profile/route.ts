import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  job_title: z.string().trim().max(120).nullable().optional(),
  max_tokens_per_request: z.number().int().min(200).max(4000),
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

  const body = await request.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      job_title: parsed.data.job_title ?? null,
      ai_preferences: {
        max_tokens_per_request: parsed.data.max_tokens_per_request,
      },
    })
    .eq("id", user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ profile: data });
}
