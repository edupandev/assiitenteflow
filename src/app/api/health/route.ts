import { NextResponse } from "next/server";
import { isSupabaseServerConfigured } from "@/lib/supabase/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "pulsework-api",
    supabaseConfigured: isSupabaseServerConfigured(),
    timestamp: new Date().toISOString(),
  });
}
