import { finishAutomationDispatch } from "@/lib/automation-dispatch";
import { manualDeliveryResolution } from "@/lib/manual-delivery-resolution";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const accessToken = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!accessToken) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });

  try {
    const [{ id }, authResult, body] = await Promise.all([
      context.params,
      admin.auth.getUser(accessToken),
      request.json(),
    ]);
    const user = authResult.data.user;
    if (authResult.error || !user) return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });

    const { data: profile, error: profileError } = await admin.from("users")
      .select("company_id,is_active").eq("id", user.id).single();
    if (profileError || !profile?.company_id || profile.is_active === false) {
      return NextResponse.json({ error: "Nincs jogosultság." }, { status: 403 });
    }

    const { data: message, error: messageError } = await admin.from("messages")
      .select("id,lead_id,company_id,status,direction,sending_started_at")
      .eq("id", id).eq("company_id", profile.company_id).single();
    if (messageError || !message) return NextResponse.json({ error: "Az üzenet nem található." }, { status: 404 });

    const resolution = manualDeliveryResolution(message, body?.result, user.id);
    if (!resolution.ok) return NextResponse.json({ error: resolution.error }, { status: resolution.status });

    const { data: updated, error: updateError } = await admin.from("messages")
      .update(resolution.values)
      .eq("id", message.id).eq("company_id", profile.company_id).eq("status", "sending")
      .select("id,status,delivery_confirmed_at,delivery_failed_at,delivery_resolution_source")
      .maybeSingle();
    if (updateError) return NextResponse.json({ error: "A küldés állapota nem rendezhető." }, { status: 503 });
    if (!updated) return NextResponse.json({ error: "A küldés állapota időközben megváltozott." }, { status: 409 });

    await finishAutomationDispatch(admin, {
      companyId: profile.company_id,
      eventType: "approved_reply",
      entityId: message.id,
      status: resolution.status === "sent" ? "completed" : "failed",
    });
    if (resolution.status === "sent" && message.lead_id) {
      await finishAutomationDispatch(admin, {
        companyId: profile.company_id,
        eventType: "new_lead",
        entityId: message.lead_id,
        status: "completed",
      });
    }

    return NextResponse.json({ success: true, message: updated });
  } catch {
    return NextResponse.json({ error: "A küldés állapota nem rendezhető." }, { status: 503 });
  }
}

