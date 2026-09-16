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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug?.trim()) {
      return NextResponse.json(
        { error: "Hiányzó vállalkozásazonosító." },
        { status: 400 }
      );
    }

    const { data: company, error } = await supabaseAdmin
      .from("companies")
      .select("name, public_slug")
      .eq("public_slug", slug.trim())
      .single();

    if (error || !company) {
      console.error("Publikus cég lekérési hiba:", error);

      return NextResponse.json(
        { error: "A vállalkozás nem található." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      company: {
        name: company.name,
        slug: company.public_slug,
      },
    });
  } catch (error) {
    console.error("Public company API hiba:", error);

    return NextResponse.json(
      { error: "Hiba történt a vállalkozás lekérése közben." },
      { status: 500 }
    );
  }
}