import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const source = ts.transpileModule(readFileSync(new URL("../lib/lead-overview.ts", import.meta.url), "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{}, Intl, Date, Map}; vm.runInNewContext(source,context);
const {latestReplies,dailyCounts,replyLabel}=context.exports;
test("latest reply does not count an old draft after a newer sent reply",()=>{
 const result=latestReplies([
 {id:"1",lead_id:"a",status:"draft",created_at:"2026-09-19T09:00:00Z"},
 {id:"3",lead_id:"b",status:"sending",created_at:"2026-09-19T09:00:00Z"},
 {id:"2",lead_id:"a",status:"sent",created_at:"2026-09-19T10:00:00Z"}]);
 assert.equal(result.get("a").status,"sent"); assert.equal(result.get("b").status,"sending"); assert.equal(result.size,2);
});
test("equal timestamps select deterministically regardless of input order",()=>{
 const rows=[{id:"a",lead_id:"a",status:"draft",created_at:"2026-09-19T10:00:00Z"},{id:"b",lead_id:"a",status:"sent",created_at:"2026-09-19T10:00:00Z"}];
 assert.equal(latestReplies(rows).get("a").id,"b"); assert.equal(latestReplies(rows.reverse()).get("a").id,"b");
});
test("seven day counts use Budapest midnight and exclude earlier records",()=>{
 const days=dailyCounts([{created_at:"2026-09-18T22:30:00Z"},{created_at:"2026-09-18T21:30:00Z"},{created_at:"2026-09-12T21:00:00Z"}],new Date("2026-09-19T10:00:00Z"));
 assert.equal(days.length,7); assert.equal(days[0].day,"2026-09-13"); assert.equal(days[6].count,1); assert.equal(days[5].count,1); assert.equal(days.reduce((sum,day)=>sum+day.count,0),2);
});
test("empty data and DST boundary retain seven calendar days",()=>{
 const days=dailyCounts([],new Date("2026-03-29T22:30:00Z"));
 assert.equal(days[6].day,"2026-03-30"); assert.equal(new Set(days.map(day=>day.day)).size,7); assert.ok(days.every(day=>day.count===0));
 assert.equal(replyLabel(undefined),"Még nincs válasz");
});
