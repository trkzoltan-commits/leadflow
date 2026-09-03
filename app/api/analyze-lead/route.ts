import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
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