import { createClient } from "@supabase/supabase-js";

type MakeEvent = "new_lead" | "approved_reply";

// Only Make webhook origins are allowed; never follow a redirect with lead data.
export function validMakeWebhook(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !/^hook\.(eu[12]|us[12])\.make\.com$/.test(url.hostname) ||
      url.port || url.username || url.password || url.search || url.hash ||
      !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname)
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function getMakeWebhook(companyId: string, event: MakeEvent): Promise<string | null> {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
    const { data, error } = await admin
      .from("company_make_connections")
      .select("mode, enabled, new_lead_webhook_url, approved_reply_webhook_url")
      .eq("company_id", companyId)
      .maybeSingle();

    if (error || !data?.enabled) return null;
    if (data.mode === "company") {
      return validMakeWebhook(event === "new_lead"
        ? data.new_lead_webhook_url : data.approved_reply_webhook_url);
    }
    // Only companies explicitly migrated as existing pilot tenants may use legacy routing.
    if (data.mode === "legacy") {
      return validMakeWebhook(event === "new_lead"
        ? process.env.MAKE_NEW_LEAD_WEBHOOK_URL
        : process.env.MAKE_SEND_APPROVED_REPLY_WEBHOOK_URL);
    }
    return null;
  } catch {
    // Webhook URLs are credentials: do not log database or transport error objects.
    return null;
  }
}
