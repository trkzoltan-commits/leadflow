import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseDataRetentionStatus } from "@/lib/data-retention";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Authorization" };
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

export async function GET(request: Request) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return json({ error: "Nincs jogosultság." }, 401);
  try {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !user) return json({ error: "Nincs jogosultság." }, 401);
    const { data: profile, error: profileError } = await admin.from("users")
      .select("company_id,role,is_active").eq("id", user.id).maybeSingle();
    if (profileError || !profile?.company_id || profile.is_active === false) {
      return json({ error: "A felhasználó vállalkozása nem azonosítható." }, 403);
    }
    if (profile.role !== "owner" && profile.role !== "admin") {
      return json({ error: "Az adatmegőrzési állapotot csak tulajdonos vagy adminisztrátor láthatja." }, 403);
    }
    const { data, error } = await admin.rpc("preview_company_data_retention", { p_company_id: profile.company_id });
    const status = parseDataRetentionStatus(Array.isArray(data) ? data[0] : data);
    if (error || !status) return json({ error: "Az adatmegőrzési állapot nem érhető el." }, 503);
    return json(status);
  } catch {
    return json({ error: "Az adatmegőrzési állapot nem érhető el." }, 503);
  }
}
