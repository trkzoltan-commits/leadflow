import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isValidDateOnly, NEXT_ACTION_MAX_LENGTH } from "@/lib/lead-next-action";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

const managerRoles = new Set(["owner", "admin"]);
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

export async function PATCH(request: Request) {
  try {
    const access = await requireActiveMember(request);
    if ("error" in access) return access.error;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 });
    }
    const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const leadId = typeof input.leadId === "string" ? input.leadId : "";
    if (!uuidPattern.test(leadId)) {
      return NextResponse.json({ error: "Érvénytelen érdeklődő." }, { status: 400 });
    }

    const isClearRequest = input.nextAction === null && input.dueDate === null;
    const nextAction = typeof input.nextAction === "string" ? input.nextAction.trim() : "";
    const dueDate = typeof input.dueDate === "string" ? input.dueDate : "";
    const expectedNextAction = input.expectedNextAction === null
      ? null
      : typeof input.expectedNextAction === "string" ? input.expectedNextAction.trim() : undefined;
    const expectedDueDate = input.expectedDueDate === null
      ? null
      : typeof input.expectedDueDate === "string" ? input.expectedDueDate : undefined;
    if (!isClearRequest && (
      !nextAction || nextAction.length > NEXT_ACTION_MAX_LENGTH || !isValidDateOnly(dueDate)
    )) {
      return NextResponse.json({
        error: `A következő teendő és egy érvényes határidő kötelező. A leírás legfeljebb ${NEXT_ACTION_MAX_LENGTH} karakter lehet.`,
      }, { status: 400 });
    }
    if (expectedNextAction === undefined || expectedDueDate === undefined ||
      ((expectedNextAction === null) !== (expectedDueDate === null)) ||
      (expectedNextAction !== null && (
        !expectedNextAction || expectedNextAction.length > NEXT_ACTION_MAX_LENGTH || !isValidDateOnly(expectedDueDate)
      ))) {
      return NextResponse.json({ error: "A teendő korábbi állapota érvénytelen." }, { status: 400 });
    }

    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("id,status,assigned_user_id,next_action,next_action_due_date")
      .eq("id", leadId)
      .eq("company_id", access.companyId)
      .maybeSingle();
    if (leadError) return NextResponse.json({ error: "Az érdeklődő nem ellenőrizhető." }, { status: 503 });
    if (!lead) return NextResponse.json({ error: "Az érdeklődő nem található." }, { status: 404 });
    if (lead.status === "processed") {
      return NextResponse.json({ error: "Lezárt ügyhöz nem állítható következő teendő." }, { status: 409 });
    }
    if (lead.next_action !== expectedNextAction || lead.next_action_due_date !== expectedDueDate) {
      return NextResponse.json({
        error: "A teendőt időközben valaki módosította. Frissítsd az oldalt, majd ellenőrizd az új értéket.",
      }, { status: 409 });
    }
    if (!managerRoles.has(access.role || "") && lead.assigned_user_id !== access.userId) {
      return NextResponse.json({ error: "Ezt a teendőt csak a felelős, a tulajdonos vagy egy adminisztrátor módosíthatja." }, { status: 403 });
    }

    let updateQuery = access.userClient
      .from("leads")
      .update({
        next_action: isClearRequest ? null : nextAction,
        next_action_due_date: isClearRequest ? null : dueDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId)
      .eq("company_id", access.companyId)
      .in("status", ["new", "contacted", "waiting", "offer_sent", "decision"]);
    updateQuery = expectedNextAction === null
      ? updateQuery.is("next_action", null)
      : updateQuery.eq("next_action", expectedNextAction);
    updateQuery = expectedDueDate === null
      ? updateQuery.is("next_action_due_date", null)
      : updateQuery.eq("next_action_due_date", expectedDueDate);

    const { data: updated, error: updateError } = await updateQuery
      .select("id,next_action,next_action_due_date")
      .maybeSingle();
    if (updateError) {
      const status = updateError.code === "42501" ? 403 : updateError.code === "23514" ? 400 : 503;
      return NextResponse.json({ error: status === 403
        ? "Ezt a teendőt már nem módosíthatod. Frissítsd az oldalt."
        : "A következő teendő mentése nem sikerült." }, { status });
    }
    if (!updated) return NextResponse.json({
      error: "Az ügy állapota vagy a teendő időközben megváltozott. Frissítsd az oldalt, majd próbáld újra.",
    }, { status: 409 });

    return NextResponse.json({
      leadId: updated.id,
      nextAction: updated.next_action,
      dueDate: updated.next_action_due_date,
    });
  } catch {
    return NextResponse.json({ error: "A következő teendő mentése nem sikerült." }, { status: 503 });
  }
}
