import { authenticateMake } from "@/lib/make-auth";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Hiányzó vagy érvénytelen kérés." },
        { status: 400 }
      );
    }

    type Evaluation = {
      safe_to_send: boolean;
      requires_human_review: boolean;
      risk_reason: string;
      risk_level: "low" | "medium" | "high";
    };
    type EvaluatedLead = {
      name: string | null;
      email: string | null;
      phone: string | null;
      service: string | null;
      description: string | null;
      location: string | null;
      priority: string | null;
      source: string | null;
    };

    let userLead: EvaluatedLead | null = null;
    let saveUserEvaluation: ((evaluation: Evaluation) => Promise<boolean>) | null = null;

    if (request.headers.has("x-leadflow-secret")) {
      const auth = await authenticateMake(request);
      if (!auth.ok) return auth.response;
    } else {
      const authorization = request.headers.get("authorization");
      const accessToken = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];

      if (!accessToken) {
        return NextResponse.json(
          { error: "Nincs jogosultság." },
          { status: 401 }
        );
      }

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

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser(accessToken);

      if (userError || !user) {
        return NextResponse.json(
          { error: "Nincs jogosultság." },
          { status: 401 }
        );
      }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("company_id,is_active")
        .eq("id", user.id)
        .single();

      if (profileError || !profile?.company_id || profile.is_active === false) {
        return NextResponse.json(
          { error: "A felhasználó vállalkozása nem azonosítható." },
          { status: 403 }
        );
      }

      if (
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
        .select("id,name,email,phone,service,description,location,priority,source")
        .eq("id", body.lead_id)
        .eq("company_id", profile.company_id)
        .single();

      if (leadError || !lead) {
        return NextResponse.json(
          { error: "A lead nem található." },
          { status: 404 }
        );
      }

      userLead = lead;
      saveUserEvaluation = async (evaluation) => {
        const { error: saveError } = await supabase
          .from("leads")
          .update({
            ai_safe_to_send: evaluation.safe_to_send,
            ai_requires_human_review: evaluation.requires_human_review,
            ai_risk_reason: evaluation.risk_reason,
            ai_risk_level: evaluation.risk_level,
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.lead_id)
          .eq("company_id", profile.company_id);

        return !saveError;
      };
    }

    let {
      name,
      email,
      phone,
      service,
      description,
      location,
      priority,
      source,
    } = body;
    const reply = body.reply;

    if (!reply?.trim()) {
      return NextResponse.json(
        { error: "Hiányzik az értékelendő választervezet." },
        { status: 400 }
      );
    }

    if (userLead) {
      ({
        name,
        email,
        phone,
        service,
        description,
        location,
        priority,
        source,
      } = userLead);
    }

    const response = await openai.responses.create({
      model: "gpt-5-mini",

      input: `
Feladatod egy kisvállalkozás beérkező érdeklődésének és az arra AI által
generált választervezetnek a biztonsági értékelése.

Két külön kérdésben kell döntened:

1. SAFE_TO_SEND
Azt jelenti, hogy maga az elkészült AI-válasz biztonságosan elküldhető-e
emberi ellenőrzés nélkül.

2. REQUIRES_HUMAN_REVIEW
Azt jelenti, hogy maga az érdeklődő megkeresése olyan üzleti, pénzügyi,
műszaki, jogi vagy egyéb döntést igényel-e, amelyet embernek kell
ellenőriznie akkor is, ha az AI válasza önmagában óvatosan fogalmaz.

Érdeklődő adatai:

Név: ${name || "nincs megadva"}
E-mail: ${email || "nincs megadva"}
Telefon: ${phone || "nincs megadva"}
Szolgáltatás: ${service || "nincs megadva"}
Leírás: ${description || "nincs megadva"}
Helyszín: ${location || "nincs megadva"}
Prioritás: ${priority || "nincs megadva"}
Forrás: ${source || "nincs megadva"}

AI által elkészített válasz:

${reply}

SAFE_TO_SEND = false például akkor, ha a válasz:

- konkrét árat, kedvezményt vagy fizetési feltételt talál ki vagy ígér;
- konkrét határidőt vagy időpontot vállal ellenőrzés nélkül;
- garanciát vagy műszaki teljesítményt ígér;
- szerződéses vagy jogi kötelezettséget vállal;
- nem ismert adatot tényként állít;
- reklamációban, visszatérítésben vagy kártérítésben dönt;
- olyan műszaki állítást tesz, amelyet az adatok nem támasztanak alá;
- bizonytalan, félrevezető vagy szakmailag kockázatos.

SAFE_TO_SEND = true lehet például akkor, ha a válasz:

- megköszöni a megkeresést;
- további adatot vagy fényképet kér;
- pontosító kérdéseket tesz fel;
- általános tájékoztatást ad;
- nem talál ki árat, határidőt, garanciát vagy műszaki adatot;
- nem vállal ellenőrizetlen kötelezettséget.

REQUIRES_HUMAN_REVIEW = true például akkor, ha az érdeklődő:

- konkrét árat vagy árajánlatot kér;
- kedvezményt vagy egyedi fizetési feltételt kér;
- konkrét gyártási, szállítási vagy kivitelezési határidőt kér;
- garanciáról vagy jótállásról kér konkrét vállalást;
- reklamációt tesz;
- visszatérítést, kártérítést vagy kompenzációt kér;
- jogi vagy szerződéses kérdést vet fel;
- konkrét műszaki vállalást vagy méretezési döntést kér;
- biztonságkritikus műszaki kérdést tesz fel;
- olyan egyedi döntést kér, amelyhez a vállalkozás jóváhagyása szükséges;
- a megkeresés ellentmondásos vagy lényeges üzleti kockázatot tartalmaz.

REQUIRES_HUMAN_REVIEW = false lehet például akkor, ha az érdeklődő:

- általánosan érdeklődik egy szolgáltatás iránt;
- alapinformációkat ad meg;
- fényképet vagy további adatot tud küldeni;
- olyan kérdést tesz fel, amely további pontosítással biztonságosan
  kezelhető üzleti döntés nélkül.

FONTOS:

A SAFE_TO_SEND és a REQUIRES_HUMAN_REVIEW két külön döntés.

Előfordulhat például:

SAFE_TO_SEND = true
REQUIRES_HUMAN_REVIEW = true

ha az AI válasza helyesen csak további információt kér, de az érdeklődő
konkrét árat, határidőt vagy garanciális vállalást szeretne.

Safe üzemmódban ilyen esetben NEM szabad automatikusan elküldeni a választ.

Legyél konzervatív.
Ha bizonytalan vagy, inkább állítsd a REQUIRES_HUMAN_REVIEW értékét true-ra.
      `,

      text: {
        format: {
          type: "json_schema",
          name: "reply_safety_evaluation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              safe_to_send: {
                type: "boolean",
              },
              requires_human_review: {
                type: "boolean",
              },
              risk_reason: {
                type: "string",
              },
              risk_level: {
                type: "string",
                enum: ["low", "medium", "high"],
              },
            },
            required: [
              "safe_to_send",
              "requires_human_review",
              "risk_reason",
              "risk_level",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    if (!response.output_text) {
      throw new Error("Az AI nem adott vissza értékelést.");
    }

    const evaluation = JSON.parse(response.output_text) as Evaluation;

    if (saveUserEvaluation) {
      const saved = await saveUserEvaluation(evaluation);

      if (!saved) {
        return NextResponse.json(
          { error: "Az értékelés elkészült, de nem sikerült elmenteni." },
          { status: 503 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      safe_to_send: evaluation.safe_to_send,
      requires_human_review: evaluation.requires_human_review,
      risk_reason: evaluation.risk_reason,
      risk_level: evaluation.risk_level,
    });
  } catch (error) {
    console.error("AI válaszbiztonsági értékelési hiba:", error);

    return NextResponse.json(
      {
        error: "A válasz biztonsági értékelése sikertelen.",
      },
      { status: 500 }
    );
  }
}
