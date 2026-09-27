import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../supabase/migrations/202609270001_user_preferences.sql", import.meta.url), "utf8");

test("user preferences are user-scoped and expose no tenant-wide update policy", () => {
  assert.match(sql, /alter table public\.user_preferences enable row level security/i);
  assert.match(sql, /using \(user_id = auth\.uid\(\)\)/i);
  assert.match(sql, /with check \(user_id = auth\.uid\(\)\)/i);
  assert.match(sql, /revoke all on public\.user_preferences from public, anon/i);
  assert.match(sql, /grant select, insert, update on public\.user_preferences to authenticated/i);
});

test("database constraints accept only the approved themes and modes", () => {
  assert.match(sql, /accent_theme in \('blue', 'green', 'orange'\)/i);
  assert.match(sql, /color_mode in \('light', 'dark', 'system'\)/i);
});
