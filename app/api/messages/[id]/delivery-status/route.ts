import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  try {
    const [{ id }, authResult] = await Promise.all([context.params, admin.auth.getUser(accessToken)]);
    const user = authResult.data.user;
    if (authResult.error || !user) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
    const { data: profile, error: profileError } = await admin.from("users")
      .select("company_id,is_active").eq("id", user.id).single();
    if (profileError || !profile?.company_id || profile.is_active === false) {
      return NextResponse.json({ error: "Nincs jogosultság." }, { status: 403 });
    }
    const { data: message, error: messageError } = await admin.from("messages")
      .select("id").eq("id", id).eq("company_id", profile.company_id).single();
    if (messageError || !message) return NextResponse.json({ error: "Az üzenet nem található." }, { status: 404 });

    const { data: audit, error: auditError } = await admin.from("automation_dispatches")
      .select("status,attempt_count,last_attempt_at,updated_at")
      .eq("company_id", profile.company_id).eq("event_type", "approved_reply").eq("entity_id", id).maybeSingle();
    if (auditError) return NextResponse.json({ error: "A küldési napló nem érhető el." }, { status: 503 });
    return NextResponse.json({
      status: audit?.status ?? null,
      attemptCount: audit?.attempt_count ?? 0,
      lastAttemptAt: audit?.last_attempt_at ?? null,
      updatedAt: audit?.updated_at ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "A küldési napló nem érhető el." }, { status: 503 });
  }
}
