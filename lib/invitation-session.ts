export type InvitationCredentials =
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "code"; code: string };

function readAuthLinkCredentials(
  href: string,
  expectedType: "invite" | "recovery",
  marker: "invitation" | "recovery",
): InvitationCredentials | null {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");

  if (hash.get("type") === expectedType && accessToken && refreshToken) {
    return { kind: "tokens", accessToken, refreshToken };
  }

  const code = url.searchParams.get("code");
  if (url.searchParams.get(marker) === "1" && code) {
    return { kind: "code", code };
  }

  return null;
}

export function readInvitationCredentials(href: string): InvitationCredentials | null {
  return readAuthLinkCredentials(href, "invite", "invitation");
}

export function readRecoveryCredentials(href: string): InvitationCredentials | null {
  return readAuthLinkCredentials(href, "recovery", "recovery");
}
