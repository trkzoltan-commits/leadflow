import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

function isAuthorized(request: Request) {
  const apiSecret = process.env.MAKE_API_SECRET;
  const receivedSecret = request.headers.get("x-leadflow-secret");

  if (!apiSecret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Szerver konfigurációs hiba." },
        { status: 500 }
      ),
    };
  }

  if (!receivedSecret || receivedSecret !== apiSecret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Nincs jogosultság." },
        { status: 401 }
      ),
    };
  }

  return { ok: true };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = isAuthorized(request);

    if (!auth.ok) {
      return auth.response;
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Hiányzó üzenetazonosító." },
        { status: 400 }
      );
    }

    if (!status?.trim()) {
      return NextResponse.json(
        { error: "Hiányzó státusz." },
        { status: 400 }
      );
    }

    const companyId = process.env.LEADFLOW_COMPANY_ID;

    if (!companyId) {
      return NextResponse.json(
        { error: "Szerver konfigurációs hiba." },
        { status: 500 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("messages")
      .update({
        status: status.trim(),
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select(
        `
        id,
        lead_id,
        status,
        content,
        channel,
        direction,
        sender,
        created_at
        `
      )
      .single();

    if (error || !data) {
      console.error("Üzenet státusz frissítési hiba:", error);

      return NextResponse.json(
        { error: "Nem sikerült frissíteni az üzenetet." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: data,
    });
  } catch (error) {
    console.error("Message PATCH API hiba:", error);

    return NextResponse.json(
      { error: "Hiba történt az üzenet frissítése közben." },
      { status: 500 }
    );
  }
}