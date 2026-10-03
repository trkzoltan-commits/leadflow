import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

const assignableRoles = new Set(["admin", "user"]);
const inviteRedirect = "https://leadflow-three-psi.vercel.app/meghivas?invitation=1";

async function requireOwner(request: Request) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return { error: NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 }) };

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !user) return { error: NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 }) };

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("company_id,role,is_active")
    .eq("id", user.id)
    .single();
  if (profileError || !profile?.company_id || profile.is_active === false) {
    return { error: NextResponse.json({ error: "A felhasználó vállalkozása nem azonosítható." }, { status: 403 }) };
  }
  if (profile.role !== "owner") {
    return { error: NextResponse.json({ error: "A munkatársakat csak a tulajdonos kezelheti." }, { status: 403 }) };
  }
  return { user, companyId: profile.company_id };
}

export async function GET(request: Request) {
  try {
    const access = await requireOwner(request);
    if ("error" in access) return access.error;

    const { data: profiles, error } = await supabaseAdmin
      .from("users")
      .select("id,role,is_active")
      .eq("company_id", access.companyId);
    if (error) return NextResponse.json({ error: "A munkatársak nem tölthetők be." }, { status: 503 });

    const members = await Promise.all((profiles || []).map(async (profile) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(profile.id);
      return {
        id: profile.id,
        email: data.user?.email || "Ismeretlen e-mail-cím",
        role: profile.role || "user",
        active: profile.is_active !== false,
        current: profile.id === access.user.id,
      };
    }));
    members.sort((a, b) => Number(b.current) - Number(a.current) || a.email.localeCompare(b.email, "hu"));
    return NextResponse.json({ members }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "A munkatársak nem tölthetők be." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireOwner(request);
    if ("error" in access) return access.error;
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body?.role === "string" ? body.role : "user";
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Adj meg érvényes e-mail-címet." }, { status: 400 });
    }
    if (!assignableRoles.has(role)) {
      return NextResponse.json({ error: "Érvénytelen szerepkör." }, { status: 400 });
    }

    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteRedirect,
    });
    if (inviteError || !invited?.user?.id) {
      return NextResponse.json({ error: "A meghívó nem küldhető el. Lehet, hogy ez az e-mail-cím már regisztrálva van." }, { status: 409 });
    }

    const { error: linkError } = await supabaseAdmin.from("users").insert({
      id: invited.user.id,
      company_id: access.companyId,
      role,
      is_active: true,
    });
    if (linkError) {
      await supabaseAdmin.auth.admin.deleteUser(invited.user.id);
      return NextResponse.json({ error: "A meghívott fiókot nem sikerült a vállalkozáshoz rendelni." }, { status: 503 });
    }
    return NextResponse.json({ member: { id: invited.user.id, email, role, active: true, current: false } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A meghívás nem sikerült." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireOwner(request);
    if ("error" in access) return access.error;
    const body = await request.json();
    const memberId = typeof body?.memberId === "string" ? body.memberId : "";
    const action = body?.action === "set_active" ? "set_active" : "set_role";
    const role = typeof body?.role === "string" ? body.role : "";
    const active = body?.active;
    if (!memberId || (action === "set_role" && !assignableRoles.has(role)) || (action === "set_active" && typeof active !== "boolean")) {
      return NextResponse.json({ error: "Érvénytelen jogosultságmódosítás." }, { status: 400 });
    }
    if (memberId === access.user.id) {
      return NextResponse.json({ error: "A saját tulajdonosi jogosultságod itt nem módosítható." }, { status: 400 });
    }

    const { data: target, error: targetError } = await supabaseAdmin
      .from("users")
      .select("id,role,is_active")
      .eq("id", memberId)
      .eq("company_id", access.companyId)
      .single();
    if (targetError || !target) return NextResponse.json({ error: "A munkatárs nem található." }, { status: 404 });
    if (target.role === "owner") {
      return NextResponse.json({ error: "A tulajdonosi jogosultság itt nem módosítható." }, { status: 400 });
    }

    if (action === "set_active") {
      const authUpdate = await supabaseAdmin.auth.admin.updateUserById(memberId, {
        ban_duration: active ? "none" : "876000h",
      });
      if (authUpdate.error) return NextResponse.json({ error: "A bejelentkezési hozzáférés módosítása nem sikerült." }, { status: 503 });

      const { error: statusError } = await supabaseAdmin.from("users").update({ is_active: active })
        .eq("id", memberId).eq("company_id", access.companyId);
      if (statusError) {
        await supabaseAdmin.auth.admin.updateUserById(memberId, { ban_duration: active ? "876000h" : "none" });
        return NextResponse.json({ error: "A hozzáférési állapot mentése nem sikerült." }, { status: 503 });
      }
      return NextResponse.json({ memberId, active });
    }

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({ role })
      .eq("id", memberId)
      .eq("company_id", access.companyId);
    if (updateError) return NextResponse.json({ error: "A jogosultság módosítása nem sikerült." }, { status: 503 });
    return NextResponse.json({ memberId, role });
  } catch {
    return NextResponse.json({ error: "A jogosultság módosítása nem sikerült." }, { status: 503 });
  }
}
