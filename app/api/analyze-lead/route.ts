import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

    if (!accessToken) {
      return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
    }

    // A felhasználó tokenjével az adatbázis RLS-szabályai is érvényesülnek.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    const { data: { user }, error: userError } =
      await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.company_id) {
      return NextResponse.json(
        { error: "A felhasználó vállalkozása nem azonosítható." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body.lead_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.lead_id)
    ) {
      return NextResponse.json(
        { error: "Hiányzó vagy érvénytelen lead azonosító." },
        { status: 400 }
      );
    }

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id")
      .eq("id", body.lead_id)
      .eq("company_id", profile.company_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "A lead nem található." },
        { status: 404 }
      );
    }

    const {
      name,
      email,
      phone,
      service,
      description,
      location,
      priority,
      status,
      source,
    } = body;

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: `
Elemezd az alábbi érdeklődőt egy kisvállalkozás számára.

Adatok:
Név: ${name || "nincs megadva"}
E-mail: ${email || "nincs megadva"}
Telefon: ${phone || "nincs megadva"}
Szolgáltatás: ${service || "nincs megadva"}
Leírás: ${description || "nincs megadva"}
Helyszín: ${location || "nincs megadva"}
Prioritás: ${priority || "nincs megadva"}
Állapot: ${status || "nincs megadva"}
Forrás: ${source || "nincs megadva"}

Adj rövid, magyar nyelvű választ az alábbi formában:

Összefoglaló:
...

Hiányzó információk:
...

Javasolt következő lépés:
...
      `,
    });

    return NextResponse.json({
      result: response.output_text,
    });
  } catch (error) {
    console.error("OpenAI API hiba:", error);

    return NextResponse.json(
      {
        error: "Az AI-feldolgozás sikertelen.",
      },
      { status: 500 }
    );
  }
}
