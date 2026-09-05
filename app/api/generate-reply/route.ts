import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

async function isAuthorized(request: Request) {
  const apiSecret = process.env.MAKE_API_SECRET;
  const receivedSecret = request.headers.get("x-leadflow-secret");

  // 1. Make.com hitelesítés
  if (apiSecret && receivedSecret === apiSecret) {
    return true;
  }

  // 2. LeadFlow bejelentkezett felhasználó hitelesítés
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const accessToken = authorization.slice(7);

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !user) {
    return false;
  }

  return true;
}

export async function POST(request: Request) {
  try {
    const authorized = await isAuthorized(request);

    if (!authorized) {
      return NextResponse.json(
        { error: "Nincs jogosultság." },
        { status: 401 }
      );
    }

    const body = await request.json();

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
      aiSummary,
    } = body;

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: `
Írj udvarias, természetes hangvételű magyar választervezetet egy érdeklődő számára.

A válasz egy kisvállalkozás nevében készüljön.
Ne találj ki nem ismert adatokat, árakat, határidőket vagy műszaki részleteket.
Ha fontos információ hiányzik, kérdezz rá röviden és érthetően.

Érdeklődő adatai:

Név: ${name || "nincs megadva"}
E-mail: ${email || "nincs megadva"}
Telefon: ${phone || "nincs megadva"}
Szolgáltatás: ${service || "nincs megadva"}
Leírás: ${description || "nincs megadva"}
Helyszín: ${location || "nincs megadva"}
Prioritás: ${priority || "nincs megadva"}
Állapot: ${status || "nincs megadva"}
Forrás: ${source || "nincs megadva"}

Korábbi AI elemzés:
${aiSummary || "nincs"}

A válasz legyen:
- magyar nyelvű,
- tömör,
- ügyfélbarát,
- elküldhető e-mailben vagy üzenetben,
- ne tartalmazzon belső megjegyzést vagy magyarázatot.

Csak a kész választervezetet add vissza.
      `,
    });

    return NextResponse.json({
      reply: response.output_text,
    });
  } catch (error) {
    console.error("AI válaszgenerálási hiba:", error);

    return NextResponse.json(
      {
        error: "A választervezet elkészítése sikertelen.",
      },
      { status: 500 }
    );
  }
}