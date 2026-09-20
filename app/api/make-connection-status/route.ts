import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { makeConnectionStatus } from "@/lib/make-connection-status";

export async function GET(request: Request) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });

  try {
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !user) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });

    const { data: profile, error: profileError } = await userClient.from("users")
      .select("company_id").eq("id", user.id).single();
    if (profileError || !profile?.company_id) {
      return NextResponse.json({ error: "A felhasználó vállalkozása nem azonosítható." }, { status: 403 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
    const { data: connection, error: connectionError } = await admin
      .from("company_make_connections")
      .select("mode, enabled, new_lead_webhook_url, approved_reply_webhook_url")
      .eq("company_id", profile.company_id).maybeSingle();
    if (connectionError) {
      return NextResponse.json({ error: "A Make-kapcsolat állapota nem érhető el." }, { status: 503 });
    }

    let hasCompanyCredential = false;
    if (connection?.mode === "company" && connection.enabled) {
      const { data: credential, error: credentialError } = await admin
        .from("make_credentials")
        .select("id")
        .eq("company_id", profile.company_id)
        .is("revoked_at", null)
        .limit(1)
        .maybeSingle();
      if (credentialError) {
        return NextResponse.json({ error: "A Make-kapcsolat állapota nem érhető el." }, { status: 503 });
      }
      hasCompanyCredential = Boolean(credential);
    }

    const status = makeConnectionStatus(
      connection,
      hasCompanyCredential,
      process.env.MAKE_NEW_LEAD_WEBHOOK_URL,
      process.env.MAKE_SEND_APPROVED_REPLY_WEBHOOK_URL
    );
    return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Do not log webhook URLs, tokens, or database error details.
    return NextResponse.json({ error: "A Make-kapcsolat állapota nem érhető el." }, { status: 503 });
  }
}
