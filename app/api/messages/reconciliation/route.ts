import { authenticateMake } from "@/lib/make-auth";
import {
  deliveryReconciliationCutoff,
  deliveryReference,
} from "@/lib/delivery-reconciliation";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const PAGE_SIZE = 50;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "x-leadflow-secret",
};

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

export async function GET(request: Request) {
  const auth = await authenticateMake(request);
  if (!auth.ok) return auth.response;

  // The shared operator key must never expose a cross-company reconciliation
  // queue. This endpoint is available only to a tenant-owned Make credential.
  if (!auth.companyId) {
    return json({ error: "Ehhez céges Make-kulcs szükséges." }, 403);
  }

  try {
    const cutoff = deliveryReconciliationCutoff();
    const { data, error } = await admin
      .from("messages")
      .select("id,sending_started_at")
      .eq("company_id", auth.companyId)
      .eq("direction", "outgoing")
      .eq("status", "sending")
      .is("provider_message_id", null)
      .lte("sending_started_at", cutoff)
      .order("sending_started_at", { ascending: true })
      .limit(PAGE_SIZE);

    if (error) return json({ error: "A küldési egyeztetés nem érhető el." }, 503);

    const messages = (data ?? []).flatMap(message => {
      const reference = deliveryReference(message.id);
      return reference ? [{
        message_id: reference.headerValue,
        sending_started_at: message.sending_started_at,
        gmail_search_query: reference.gmailSearchQuery,
      }] : [];
    });

    return json({ messages, has_more: messages.length === PAGE_SIZE });
  } catch {
    return json({ error: "A küldési egyeztetés nem érhető el." }, 503);
  }
}
