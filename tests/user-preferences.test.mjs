import assert from "node:assert/strict";
import test from "node:test";
import { normalizePreferences, roleLabel, validAccentTheme, validColorMode } from "../lib/user-preferences.ts";

test("accepts only the three approved themes and display modes", () => {
  for (const value of ["blue", "green", "orange"]) assert.equal(validAccentTheme(value), true);
  for (const value of ["violet", "red", "#002bff", null]) assert.equal(validAccentTheme(value), false);
  for (const value of ["light", "dark", "system"]) assert.equal(validColorMode(value), true);
  for (const value of ["auto", "compact", null]) assert.equal(validColorMode(value), false);
});

test("normalizes invalid database or local values to blue and system", () => {
  assert.deepEqual(normalizePreferences({ accent_theme: "green", color_mode: "dark" }), { accentTheme: "green", colorMode: "dark" });
  assert.deepEqual(normalizePreferences({ accent_theme: "violet", color_mode: "auto" }), { accentTheme: "blue", colorMode: "system" });
  assert.deepEqual(normalizePreferences(null), { accentTheme: "blue", colorMode: "system" });
});

test("profile roles have clear Hungarian labels without exposing unknown values", () => {
  assert.equal(roleLabel("owner"), "Tulajdonos");
  assert.equal(roleLabel("admin"), "Adminisztrátor");
  assert.equal(roleLabel("unexpected"), "Felhasználó");
});
