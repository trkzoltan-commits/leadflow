import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

const assignmentRoles = new Set(["owner", "admin"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireActiveMember(request: Request) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return { error: NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 }) };

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }
  );
  const { data: { user }, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !user) return { error: NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 }) };

  const { data: profile, error: profileError } = await userClient
    .from("users")
    .select("company_id,role,is_active")
    .eq("id", user.id)
    .single();
  if (profileError || !profile?.company_id || profile.is_active === false) {
    return { error: NextResponse.json({ error: "A felhasználó vállalkozása nem azonosítható." }, { status: 403 }) };
  }
  return { userClient, userId: user.id, companyId: profile.company_id as string, role: profile.role as string | null };
}

export async function GET(request: Request) {
  try {
    const access = await requireActiveMember(request);
    if ("error" in access) return access.error;

    const { data: profiles, error } = await supabaseAdmin
      .from("users")
      .select("id,role")
      .eq("company_id", access.companyId)
      .eq("is_active", true);
    if (error) return NextResponse.json({ error: "A felelősök nem tölthetők be." }, { status: 503 });

    const resolved = await Promise.all((profiles || []).map(async profile => {
      const { data, error: authError } = await supabaseAdmin.auth.admin.getUserById(profile.id);
      if (authError || !data.user?.email) return null;
      return { id: profile.id, email: data.user.email, role: profile.role || "user" };
    }));
    const members = resolved.filter((member): member is NonNullable<typeof member> => member !== null);
    members.sort((left, right) => Number(right.id === access.userId) - Number(left.id === access.userId)
      || left.email.localeCompare(right.email, "hu"));

    return NextResponse.json({
      members,
      currentUserId: access.userId,
      canAssign: assignmentRoles.has(access.role || ""),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "A felelősök nem tölthetők be." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireActiveMember(request);
    if ("error" in access) return access.error;
    if (!assignmentRoles.has(access.role || "")) {
      return NextResponse.json({ error: "Felelőst csak tulajdonos vagy adminisztrátor jelölhet ki." }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 });
    }
    const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const leadId = typeof input.leadId === "string" ? input.leadId : "";
    const assignedUserId = input.assignedUserId === null
      ? null
      : typeof input.assignedUserId === "string" ? input.assignedUserId : undefined;
    if (!uuidPattern.test(leadId) || assignedUserId === undefined || (assignedUserId !== null && !uuidPattern.test(assignedUserId))) {
      return NextResponse.json({ error: "Érvénytelen felelős-hozzárendelés." }, { status: 400 });
    }

    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("id", leadId)
      .eq("company_id", access.companyId)
      .maybeSingle();
    if (leadError) return NextResponse.json({ error: "Az érdeklődő nem ellenőrizhető." }, { status: 503 });
    if (!lead) return NextResponse.json({ error: "Az érdeklődő nem található." }, { status: 404 });

    if (assignedUserId) {
      const { data: target, error: targetError } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("id", assignedUserId)
        .eq("company_id", access.companyId)
        .eq("is_active", true)
        .maybeSingle();
      if (targetError) return NextResponse.json({ error: "A munkatárs nem ellenőrizhető." }, { status: 503 });
      if (!target) return NextResponse.json({ error: "A kiválasztott munkatárs nem rendelhető ehhez az ügyhöz." }, { status: 400 });
    }

    // Write with the caller's JWT as well: RLS and the database role trigger both
    // re-check the owner/admin permission at the moment of the update.
    const { data: updated, error: updateError } = await access.userClient
      .from("leads")
      .update({ assigned_user_id: assignedUserId })
      .eq("id", leadId)
      .eq("company_id", access.companyId)
      .select("id,assigned_user_id")
      .maybeSingle();
    if (updateError) return NextResponse.json({ error: "A felelős mentése nem sikerült." }, { status: 503 });
    if (!updated) return NextResponse.json({ error: "Az érdeklődő nem található." }, { status: 404 });

    return NextResponse.json({ leadId: updated.id, assignedUserId: updated.assigned_user_id });
  } catch {
    return NextResponse.json({ error: "A felelős mentése nem sikerült." }, { status: 503 });
  }
}
