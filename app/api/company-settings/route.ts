import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const allowedModes = new Set(["manual", "safe", "automatic"]);

function optionalText(value: unknown, maximum: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("invalid");
  const normalized = value.trim();
  if (normalized.length > maximum) throw new Error("invalid");
  return normalized || null;
}

export async function PATCH(request: Request) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
  try {
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !user) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
    const { data: profile, error: profileError } = await supabaseAdmin.from("users")
      .select("company_id,role,is_active").eq("id", user.id).single();
    if (profileError || !profile?.company_id || profile.is_active === false) return NextResponse.json({ error: "A felhasználó vállalkozása nem azonosítható." }, { status: 403 });
    if (profile.role !== "owner" && profile.role !== "admin") {
      return NextResponse.json({ error: "A céges beállításokat csak tulajdonos vagy adminisztrátor módosíthatja." }, { status: 403 });
    }
    const body = await request.json();
    if (!allowedModes.has(body?.autoReplyMode) || typeof body?.signatureEnabled !== "boolean" || typeof body?.signatureShowLogo !== "boolean") {
      return NextResponse.json({ error: "Érvénytelen céges beállítás." }, { status: 400 });
    }
    const update = {
      auto_reply_mode: body.autoReplyMode,
      email_signature_enabled: body.signatureEnabled,
      email_signature_show_logo: body.signatureShowLogo,
      email_signoff: optionalText(body.emailSignoff, 100) || "Üdvözlettel,",
      email_signer_name: optionalText(body.signerName, 120),
      email_signer_role: optionalText(body.signerRole, 120),
      email_phone: optionalText(body.signaturePhone, 80),
      email_address: optionalText(body.signatureEmail, 254),
      email_website: optionalText(body.signatureWebsite, 300),
      email_legal_text: optionalText(body.signatureLegalText, 1000),
      updated_at: new Date().toISOString(),
    };
    if (update.email_address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.email_address)) {
      return NextResponse.json({ error: "Az aláírás e-mail-címe nem érvényes." }, { status: 400 });
    }
    const { error: updateError } = await supabaseAdmin.from("company_settings").update(update).eq("company_id", profile.company_id);
    if (updateError) return NextResponse.json({ error: "A céges beállítások mentése nem sikerült." }, { status: 503 });
    return NextResponse.json({ saved: true });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid") return NextResponse.json({ error: "Egy vagy több mező túl hosszú vagy érvénytelen." }, { status: 400 });
    return NextResponse.json({ error: "A céges beállítások mentése nem sikerült." }, { status: 503 });
  }
}
