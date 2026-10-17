import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getMakeWebhook } from "@/lib/make-webhook";
import { beginAutomationDispatch, finishAutomationDispatch, webhookAttemptResult } from "@/lib/automation-dispatch";

const supabaseAdmin = createClient(
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

const publicLeadLimits = {
  submission_id: 36,
  company_slug: 63,
  name: 120,
  email: 254,
  phone: 50,
  service: 160,
  description: 4000,
  location: 160,
} as const;

type PublicLeadInput = {
  submission_id: string;
  company_slug: string;
  name: string;
  email: string;
  phone: string;
  service: string;
  description: string;
  location: string;
};

const maxPublicLeadBodyBytes = 16 * 1024;

export async function readPublicLeadBody(request: Request, maxBytes = maxPublicLeadBodyBytes): Promise<
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string }
> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    return { ok: false, status: 413, error: "Az ajánlatkérés túl nagy." };
  }

  if (!request.body) return { ok: false, status: 400, error: "Érvénytelen ajánlatkérés." };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413, error: "Az ajánlatkérés túl nagy." };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "Érvénytelen ajánlatkérés." };
  }
}

export function validatePublicLeadBody(body: unknown):
  | { ok: true; spam: boolean; value: PublicLeadInput }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Érvénytelen ajánlatkérés." };
  }
  const source = body as Record<string, unknown>;
  const value = {} as PublicLeadInput;
  for (const [field, limit] of Object.entries(publicLeadLimits) as Array<[keyof PublicLeadInput, number]>) {
    const input = source[field];
    if (input !== undefined && input !== null && typeof input !== "string") {
      return { ok: false, error: "Az ajánlatkérés egyik mezője érvénytelen." };
    }
    value[field] = typeof input === "string" ? input.trim() : "";
    if (value[field].length > limit) {
      return { ok: false, error: "Az ajánlatkérés egyik mezője túl hosszú." };
    }
  }
  const trap = typeof source.company_website === "string" ? source.company_website.trim() : "";
  if (trap) return { ok: true, spam: true, value };
  if (!value.company_slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.company_slug)) {
    return { ok: false, error: "Hiányzó vagy érvénytelen vállalkozásazonosító." };
  }
  if (!value.name) return { ok: false, error: "A név megadása kötelező." };
  if (!value.email && !value.phone) {
    return { ok: false, error: "Legalább egy elérhetőség megadása szükséges: e-mail vagy telefonszám." };
  }
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) {
    return { ok: false, error: "Az e-mail-cím formátuma érvénytelen." };
  }
  if (value.submission_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.submission_id)) {
    return { ok: false, error: "Az ajánlatkérés azonosítója érvénytelen." };
  }
  return { ok: true, spam: false, value };
}

export async function POST(request: Request) {
  try {
    const parsed = await readPublicLeadBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const validated = validatePublicLeadBody(parsed.value);
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
    if (validated.spam) return NextResponse.json({ success: true });
    const { submission_id, company_slug, name, email, phone, service, description, location } = validated.value;

    /*
     * A publikus slug alapján azonosítjuk a vállalkozást.
     */
    const { data: company, error: companyError } =
      await supabaseAdmin
        .from("companies")
        .select("id, public_slug")
        .eq("public_slug", company_slug)
        .single();

    if (companyError || !company) {
      console.error(
        "Publikus vállalkozás lekérési hiba:",
        companyError
      );

      return NextResponse.json(
        { error: "A vállalkozás nem található." },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("leads")
      .insert({
        company_id: company.id,
        name,
        email: email || null,
        phone: phone || null,
        service: service || null,
        description: description || null,
        location: location || null,
        priority: "medium",
        status: "new",
        source: "web",
        new_lead_dispatch_status: "pending",
        public_submission_id: submission_id || null,
      })
      .select("id")
      .single();

    if (error?.code === "23505" && submission_id) {
      const { data: existingLead, error: existingLeadError } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("company_id", company.id)
        .eq("public_submission_id", submission_id)
        .maybeSingle();
      if (!existingLeadError && existingLead) {
        return NextResponse.json({ success: true, leadId: existingLead.id, duplicate: true });
      }
    }

    if (error || !data) {
      console.error("Publikus lead mentési hiba:", error);

      return NextResponse.json(
        { error: "Nem sikerült elmenteni az érdeklődést." },
        { status: 500 }
      );
    }

    const savedLeadId = data.id;
    const savedCompanyId = company.id;
    async function recordDispatchStatus(status: "accepted" | "unconfigured" | "uncertain") {
      const { error: updateError } = await supabaseAdmin.from("leads")
        .update({ new_lead_dispatch_status: status })
        .eq("id", savedLeadId)
        .eq("company_id", savedCompanyId);
      if (updateError) console.error("Új érdeklődő Make-indítási állapotának mentése sikertelen.");
    }

    const webhookUrl = await getMakeWebhook(company.id, "new_lead");

    if (webhookUrl) {
      const auditStarted = await beginAutomationDispatch(supabaseAdmin, {
        companyId: company.id, eventType: "new_lead", entityId: data.id,
      });
      if (!auditStarted) {
        console.error("Az új érdeklődő Make-indítási naplója nem hozható létre.");
        await recordDispatchStatus("uncertain");
        return NextResponse.json({ success: true, leadId: data.id });
      }
      try {
        const webhookResponse = await fetch(webhookUrl, {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event: "lead.created",
            lead_id: data.id,
            company_id: company.id,
            company_slug: company.public_slug,
            timestamp: new Date().toISOString(),
          }),
        });

        const attempt = webhookAttemptResult(webhookResponse);
        await finishAutomationDispatch(supabaseAdmin, {
          companyId: company.id, eventType: "new_lead", entityId: data.id,
          status: attempt.status, httpStatus: attempt.httpStatus, errorCode: attempt.errorCode,
        });
        if (!webhookResponse.ok) {
          console.error(
            "Make webhook HTTP hiba:",
            webhookResponse.status,
            webhookResponse.statusText
          );
          await recordDispatchStatus("uncertain");
        } else {
          await recordDispatchStatus("accepted");
        }
      } catch {
        console.error(
          "Make webhook hívási hiba."
        );
        await recordDispatchStatus("uncertain");
        await finishAutomationDispatch(supabaseAdmin, {
          companyId: company.id, eventType: "new_lead", entityId: data.id,
          status: "uncertain", errorCode: "network",
        });
      }
    } else {
      console.warn(
        "A vállalkozás Make-kapcsolata nem érhető el."
      );
      await recordDispatchStatus("unconfigured");
      const auditStarted = await beginAutomationDispatch(supabaseAdmin, {
        companyId: company.id, eventType: "new_lead", entityId: data.id,
      });
      if (auditStarted) await finishAutomationDispatch(supabaseAdmin, {
        companyId: company.id, eventType: "new_lead", entityId: data.id,
        status: "unconfigured", errorCode: "unconfigured",
      });
    }

    return NextResponse.json({
      success: true,
      leadId: data.id,
    });
  } catch (error) {
    console.error(
      "Publikus lead API hiba:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Hiba történt az érdeklődés feldolgozása közben.",
      },
      { status: 500 }
    );
  }
}
