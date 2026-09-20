import { validMakeWebhook } from "./make-webhook";

export type MakeConnectionStatus = "company_active" | "legacy" | "setup_required";

type Connection = {
  mode: string;
  enabled: boolean;
  new_lead_webhook_url: string | null;
  approved_reply_webhook_url: string | null;
};

export function makeConnectionStatus(
  connection: Connection | null,
  hasCompanyCredential: boolean,
  legacyNewLeadUrl?: string,
  legacyApprovedReplyUrl?: string
): MakeConnectionStatus {
  if (!connection?.enabled) return "setup_required";
  if (connection.mode === "company") {
    return hasCompanyCredential && validMakeWebhook(connection.new_lead_webhook_url) &&
      validMakeWebhook(connection.approved_reply_webhook_url)
      ? "company_active" : "setup_required";
  }
  if (connection.mode === "legacy") {
    return validMakeWebhook(legacyNewLeadUrl) && validMakeWebhook(legacyApprovedReplyUrl)
      ? "legacy" : "setup_required";
  }
  return "setup_required";
}
