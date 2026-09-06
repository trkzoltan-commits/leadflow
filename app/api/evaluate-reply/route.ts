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
Feladatod annak eldöntése, hogy egy kisvállalkozás AI által generált
válasza biztonságosan elküldhető-e automatikusan emberi ellenőrzés nélkül.

Érdeklődő:

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

SAFE_TO_SEND = true csak akkor, ha a válasz alacsony kockázatú,
udvarias és nem vállal a vállalkozás nevében nem ellenőrzött kötelezettséget.

SAFE_TO_SEND = false többek között akkor, ha:

- konkrét árat, kedvezményt vagy fizetési feltételt ígér;
- konkrét határidőt, időpontot vagy rendelkezésre állást vállal;
- garanciát vagy műszaki teljesítményt ígér;
- szerződéses vagy jogi kötelezettséget vállal;
- reklamációt, vitát, kártérítést vagy visszatérítést kezel;
- olyan műszaki állítást tesz, amelyet a rendelkezésre álló adatok nem támasztanak alá;
- hiányzó információt tényként talál ki;
- bizonytalan vagy ellentmondásos a megkeresés;
- a válasz elküldése emberi döntést igényel;
- bármilyen más üzleti kockázatot látsz.

Általában biztonságos lehet például:

- a megkeresés megköszönése;
- további adatok vagy fényképek bekérése;
- pontosító kérdések;
- általános kapcsolatfelvételi válasz;
- olyan válasz, amely nem ígér árat, határidőt vagy konkrét teljesítést.

Legyél konzervatív. Ha bizonytalan vagy, SAFE_TO_SEND legyen false.
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