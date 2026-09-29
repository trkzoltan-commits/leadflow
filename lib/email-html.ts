export function plainTextToEmailHtml(content: string) {
  return content
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r\n?/g, "\n")
    .replace(/\n/g, "<br>");
}

export type EmailSignature = {
  enabled?: boolean | null;
  showLogo?: boolean | null;
  logoUrl?: string | null;
  companyName: string;
  signoff?: string | null;
  signerName?: string | null;
  signerRole?: string | null;
  phone?: string | null;
  website?: string | null;
  legalText?: string | null;
};

function safeHttpsUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function buildApprovedReplyHtml(content: string, signature: EmailSignature) {
  const body = plainTextToEmailHtml(content);
  if (signature.enabled === false) return body;

  const lines = [
    signature.signoff?.trim() || "Üdvözlettel,",
    signature.signerName?.trim(),
    signature.signerRole?.trim(),
    signature.companyName.trim(),
    signature.phone?.trim(),
  ].filter(Boolean) as string[];
  const website = safeHttpsUrl(signature.website);
  const logo = signature.showLogo === false ? null : safeHttpsUrl(signature.logoUrl);
  const signatureHtml = [
    `<div style="margin-top:24px">${lines.map(plainTextToEmailHtml).join("<br>")}`,
    website ? `<br><a href="${website}">${plainTextToEmailHtml(signature.website!)}</a>` : "",
    logo ? `<br><img src="${logo}" alt="${plainTextToEmailHtml(signature.companyName)}" style="display:block;max-width:180px;max-height:72px;margin-top:12px" />` : "",
    signature.legalText?.trim() ? `<div style="margin-top:12px;color:#64748b;font-size:12px;line-height:1.5">${plainTextToEmailHtml(signature.legalText)}</div>` : "",
    "</div>",
  ].join("");
  return `${body}${signatureHtml}`;
}
