import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    // Make.com hitelesítés
    const apiSecret = process.env.MAKE_API_SECRET;
    const receivedSecret = request.headers.get("x-leadflow-secret");

    if (!apiSecret) {
      console.error("MAKE_API_SECRET nincs beállítva.");

      return NextResponse.json(
        { error: "Szerver konfigurációs hiba." },
        { status: 500 }
      );
    }

    if (!receivedSecret || receivedSecret !== apiSecret) {
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
      source,
      reply,
    } = body;

    if (!reply?.trim()) {
      return NextResponse.json(
        { error: "Hiányzik az értékelendő választervezet." },
        { status: 400 }
      );
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

    const evaluation = JSON.parse(response.output_text);

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