import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type MakeAuth =
  | { ok: true; companyId: string | null }
  | { ok: false; response: NextResponse };

/** Server-only. null companyId is reserved for the existing operator-owned Make flow. */
export async function authenticateMake(request: Request): Promise<MakeAuth> {
  const token = request.headers.get("x-leadflow-secret");
  const denied = (): MakeAuth => ({
    ok: false,
    response: NextResponse.json({ error: "Nincs jogosultság." }, { status: 401 }),
  });

  if (!token || token.length > 512) return denied();

  const hash = (value: string) => createHash("sha256").update(value).digest();
  const legacySecret = process.env.MAKE_API_SECRET;
  // Transitional operator access only; never distribute this secret to customers.
  if (legacySecret && timingSafeEqual(hash(token), hash(legacySecret))) {
    return { ok: true, companyId: null };
  }

  if (!/^lfmk_[0-9a-f]{64}$/.test(token)) return denied();

  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
    const { data, error } = await admin
      .from("make_credentials")
      .select("company_id")
      .eq("token_hash", hash(token).toString("hex"))
      .is("revoked_at", null)
      .single();

    if (error || !data?.company_id) return denied();
    return { ok: true, companyId: data.company_id };
  } catch {
    // Never log credentials, request headers or database errors containing the hash.
    return denied();
  }
}

/** Apply the tenant boundary before reading a record, not just before writing it. */
export function scopeMakeQuery<T>(
  query: T,
  companyId: string | null
): T {
  if (companyId === null) return query;
  // Supabase's recursive builder types cannot be used as a generic constraint.
  // eq() preserves this builder's selected columns and result type.
  const filter = query as T & { eq(column: string, value: string): T };
  return filter.eq("company_id", companyId);
}
