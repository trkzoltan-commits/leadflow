import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

export async function GET(request: Request) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });

  try {
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !user) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("users")
      .select("company_id,role")
      .eq("id", user.id)
      .single();
    if (profileError || !profile?.company_id) {
      return NextResponse.json({ error: "A felhasználó vállalkozása nem azonosítható." }, { status: 403 });
    }

    const [{ data: company, error: companyError }, { data: settings, error: settingsError }] = await Promise.all([
      supabaseAdmin.from("companies").select("name,public_slug").eq("id", profile.company_id).single(),
      supabaseAdmin.from("company_settings").select("auto_reply_mode").eq("company_id", profile.company_id).single(),
    ]);
    if (companyError || settingsError || !company?.public_slug) {
      return NextResponse.json({ error: "A vállalkozás beállításai nem érhetők el." }, { status: 503 });
    }

    return NextResponse.json({
      companyId: profile.company_id,
      companyName: company.name || "",
      companySlug: company.public_slug,
      role: profile.role || "user",
      autoReplyMode: settings?.auto_reply_mode || "manual",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "A profiladatok nem érhetők el." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });

  try {
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !user) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("users").select("company_id,role").eq("id", user.id).single();
    if (profileError || !profile?.company_id) {
      return NextResponse.json({ error: "A felhasználó vállalkozása nem azonosítható." }, { status: 403 });
    }
    if (profile.role !== "owner") {
      return NextResponse.json({ error: "A cégnevet csak tulajdonos módosíthatja." }, { status: 403 });
    }

    const body = await request.json();
    const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
    if (!companyName || companyName.length > 200) {
      return NextResponse.json({ error: "A cégnév 1–200 karakter hosszú lehet." }, { status: 400 });
    }

    const { data: company, error: updateError } = await supabaseAdmin
      .from("companies")
      .update({ name: companyName })
      .eq("id", profile.company_id)
      .select("name")
      .single();
    if (updateError || !company) {
      return NextResponse.json({ error: "A cégnév módosítása nem sikerült." }, { status: 503 });
    }

    return NextResponse.json({ companyName: company.name }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "A cégnév módosítása nem sikerült." }, { status: 503 });
  }
}
