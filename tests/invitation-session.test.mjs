import assert from "node:assert/strict";
import test from "node:test";
import { readInvitationCredentials, readRecoveryCredentials } from "../lib/invitation-session.ts";

test("accepts an invite token redirect", () => {
  assert.deepEqual(readInvitationCredentials(
    "https://leadflow.example/meghivas#access_token=access&refresh_token=refresh&type=invite",
  ), { kind: "tokens", accessToken: "access", refreshToken: "refresh" });
});

test("accepts a marked PKCE invitation redirect", () => {
  assert.deepEqual(readInvitationCredentials(
    "https://leadflow.example/meghivas?invitation=1&code=invite-code",
  ), { kind: "code", code: "invite-code" });
});

test("rejects an existing session without invitation credentials", () => {
  assert.equal(readInvitationCredentials("https://leadflow.example/meghivas"), null);
  assert.equal(readInvitationCredentials(
    "https://leadflow.example/meghivas#access_token=access&refresh_token=refresh&type=recovery",
  ), null);
  assert.equal(readInvitationCredentials(
    "https://leadflow.example/meghivas?code=unmarked-code",
  ), null);
});

test("recovery accepts only recovery links with their own marker", () => {
  assert.deepEqual(readRecoveryCredentials(
    "https://leadflow.example/uj-jelszo#access_token=access&refresh_token=refresh&type=recovery",
  ), { kind: "tokens", accessToken: "access", refreshToken: "refresh" });
  assert.deepEqual(readRecoveryCredentials(
    "https://leadflow.example/uj-jelszo?recovery=1&code=recovery-code",
  ), { kind: "code", code: "recovery-code" });
  assert.equal(readRecoveryCredentials(
    "https://leadflow.example/uj-jelszo#access_token=access&refresh_token=refresh&type=invite",
  ), null);
});
