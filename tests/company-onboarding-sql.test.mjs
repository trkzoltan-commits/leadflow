import assert from "node:assert/strict";
import test from "node:test";
import { generateCompanyOnboardingSql } from "../scripts/generate-company-onboarding-sql.mjs";

test("new tenant starts in manual mode with its own disabled Make routing", () => {
  const sql = generateCompanyOnboardingSql("Próba Kft.", "proba-kft");
  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.match(sql, /insert into public\.companies \(name, public_slug\)/);
  assert.match(sql, /insert into public\.company_settings \(company_id, auto_reply_mode\)/);
  assert.match(sql, /select id, 'manual' from new_company/);
  assert.match(sql, /insert into public\.company_make_connections \(company_id, mode, enabled\)/);
  assert.match(sql, /select id, 'company', false from new_company/);
  assert.doesNotMatch(sql, /legacy|MAKE_API_SECRET|SUPABASE_SECRET_KEY/);
});

test("company name is safely escaped and slug rejects SQL fragments", () => {
  assert.match(generateCompanyOnboardingSql("O'Brien Kft.", "obrien"), /'O''Brien Kft\.'/);
  for (const slug of ["AB", "Uppercase", "a';drop", "-company", "company-", "company--test", "ékezetes"]) {
    assert.throws(() => generateCompanyOnboardingSql("Cég", slug));
  }
  assert.throws(() => generateCompanyOnboardingSql(" ", "valid-slug"));
});
