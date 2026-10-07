import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { LEAD_NOTE_MAX_LENGTH, normalizeLeadNoteContent } from "@/lib/lead-notes";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NoteRow = {
  id: string;
  lead_id: string;
  author_user_id: string;
  content: string;
  created_at: string;
};

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
    .select("company_id,is_active")
    .eq("id", user.id)
    .single();
  if (profileError || !profile?.company_id || profile.is_active === false) {
    return { error: NextResponse.json({ error: "A felhasználó vállalkozása nem azonosítható." }, { status: 403 }) };
  }

  return {
    userClient,
    userId: user.id,
    userEmail: user.email || "Ismeretlen munkatárs",
    companyId: profile.company_id as string,
  };
}

async function verifyLeadTenant(leadId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) return { error: NextResponse.json({ error: "Az érdeklődő nem ellenőrizhető." }, { status: 503 }) };
  if (!data) return { error: NextResponse.json({ error: "Az érdeklődő nem található." }, { status: 404 }) };
  return { lead: data };
}

async function resolveAuthorEmails(notes: NoteRow[], companyId: string) {
  const authorIds = [...new Set(notes.map((note) => note.author_user_id))];
  if (authorIds.length === 0) return new Map<string, string>();

  const { data: tenantAuthors, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("company_id", companyId)
    .in("id", authorIds);
  if (error) throw error;

  const entries = await Promise.all((tenantAuthors || []).map(async ({ id }) => {
    const { data } = await supabaseAdmin.auth.admin.getUserById(id);
    return [id, data.user?.email || "Korábbi munkatárs"] as const;
  }));
  return new Map(entries);
}

function serializeNote(note: NoteRow, authorEmails: Map<string, string>) {
  return {
    id: note.id,
    leadId: note.lead_id,
    authorUserId: note.author_user_id,
    authorEmail: authorEmails.get(note.author_user_id) || "Korábbi munkatárs",
    content: note.content,
    createdAt: note.created_at,
  };
}

async function readLeadNotes(userClient: SupabaseClient, leadId: string) {
  return userClient
    .from("lead_notes")
    .select("id,lead_id,author_user_id,content,created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
}

export async function GET(request: Request) {
  try {
    const access = await requireActiveMember(request);
    if ("error" in access) return access.error;

    const leadId = new URL(request.url).searchParams.get("leadId") || "";
    if (!uuidPattern.test(leadId)) {
      return NextResponse.json({ error: "Érvénytelen érdeklődő." }, { status: 400 });
    }

    const tenantLead = await verifyLeadTenant(leadId, access.companyId);
    if ("error" in tenantLead) return tenantLead.error;

    const { data, error } = await readLeadNotes(access.userClient, leadId);
    if (error) return NextResponse.json({ error: "A belső megjegyzések nem tölthetők be." }, { status: 503 });

    const notes = (data || []) as NoteRow[];
    const authorEmails = await resolveAuthorEmails(notes, access.companyId);
    return NextResponse.json(
      { notes: notes.map((note) => serializeNote(note, authorEmails)) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "A belső megjegyzések nem tölthetők be." }, { status: 503 });
  }
}

export async function POST(request: Request) {
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
    const content = normalizeLeadNoteContent(input.content);
    if (!uuidPattern.test(leadId)) {
      return NextResponse.json({ error: "Érvénytelen érdeklődő." }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({
        error: `A megjegyzés 1–${LEAD_NOTE_MAX_LENGTH} karakter hosszú lehet.`,
      }, { status: 400 });
    }

    const tenantLead = await verifyLeadTenant(leadId, access.companyId);
    if ("error" in tenantLead) return tenantLead.error;

    const { data, error } = await supabaseAdmin
      .from("lead_notes")
      .insert({
        company_id: access.companyId,
        lead_id: leadId,
        author_user_id: access.userId,
        content,
      })
      .select("id,lead_id,author_user_id,content,created_at")
      .single();
    if (error || !data) {
      const status = error?.code === "42501" ? 403 : error?.code === "23514" ? 400 : 503;
      return NextResponse.json({
        error: status === 403
          ? "Nincs jogosultságod megjegyzést hozzáadni."
          : status === 400
            ? `A megjegyzés 1–${LEAD_NOTE_MAX_LENGTH} karakter hosszú lehet.`
            : "A belső megjegyzés mentése nem sikerült.",
      }, { status });
    }

    const note = data as NoteRow;
    const authorEmails = new Map([[access.userId, access.userEmail]]);
    return NextResponse.json(
      { note: serializeNote(note, authorEmails) },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "A belső megjegyzés mentése nem sikerült." }, { status: 503 });
  }
}
