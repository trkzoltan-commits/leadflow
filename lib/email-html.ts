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
  email?: string | null;
  website?: string | null;
  legalText?: string | null;
  brandColor?: string | null;
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

  const signoff = plainTextToEmailHtml(signature.signoff?.trim() || "Üdvözlettel,");
  const companyName = plainTextToEmailHtml(signature.companyName.trim());
  const signerName = signature.signerName?.trim() ? plainTextToEmailHtml(signature.signerName) : "";
  const signerRole = signature.signerRole?.trim() ? plainTextToEmailHtml(signature.signerRole) : "";
  const phone = signature.phone?.trim();
  const email = signature.email?.trim();
  const website = safeHttpsUrl(signature.website);
  const logo = signature.showLogo === false ? null : safeHttpsUrl(signature.logoUrl);
  const brandColor = /^#[0-9a-f]{6}$/i.test(signature.brandColor || "") ? signature.brandColor! : "#002bff";
  const phoneHref = phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : null;
  const emailHref = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : null;
  const signatureHtml = [
    `<div style="margin-top:28px;font-family:Arial,sans-serif;color:#1e293b;font-size:14px;line-height:1.5">`,
    `<div style="margin-bottom:14px">${signoff}</div>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;min-width:280px"><tr>`,
    logo ? `<td style="padding:16px 18px 0 0;vertical-align:top"><img src="${logo}" alt="${companyName}" style="display:block;max-width:150px;max-height:64px;border:0" /></td>` : "",
    `<td style="padding-top:14px;vertical-align:top">`,
    `<div style="color:${brandColor};font-size:16px;font-weight:700;line-height:1.3">${companyName}</div>`,
    signerName ? `<div style="margin-top:5px;font-weight:700">${signerName}</div>` : "",
    signerRole ? `<div style="color:#64748b;font-size:13px">${signerRole}</div>` : "",
    phoneHref ? `<div style="margin-top:7px"><a href="${phoneHref}" style="color:#334155;text-decoration:none">${plainTextToEmailHtml(phone!)}</a></div>` : "",
    emailHref ? `<div><a href="${emailHref}" style="color:${brandColor};text-decoration:none">${plainTextToEmailHtml(email!)}</a></div>` : "",
    website ? `<div><a href="${website}" style="color:${brandColor};text-decoration:none">${plainTextToEmailHtml(signature.website!)}</a></div>` : "",
    `</td></tr></table>`,
    signature.legalText?.trim() ? `<div style="margin-top:14px;max-width:520px;color:#64748b;font-size:11px;line-height:1.5">${plainTextToEmailHtml(signature.legalText)}</div>` : "",
    "</div>",
  ].join("");
  return `${body}${signatureHtml}`;
}
