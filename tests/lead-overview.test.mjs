import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const source = ts.transpileModule(readFileSync(new URL("../lib/lead-overview.ts", import.meta.url), "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{}, Intl, Date, Map}; vm.runInNewContext(source,context);
const {latestReplies,dailyCounts,replyLabel,filterLeads,isDelayedSending,searchLeads}=context.exports;
test("search matches accents and multiple fields within the selected lead set",()=>{
 const leads=[
   {id:"a",name:"Nagy Sándor",email:"sandor@example.com",phone:"+36 70 123 4567",service:"Előtető",location:"Nagykanizsa"},
   {id:"b",name:"Teszt Elek",email:"elek@example.com",phone:null,service:"Kerítés",location:"Budapest"},
 ];
 assert.deepEqual(searchLeads(leads,"nagy sandor eloteto").map(lead=>lead.id),["a"]);
 assert.deepEqual(searchLeads(leads,"123 4567").map(lead=>lead.id),["a"]);
 assert.deepEqual(searchLeads(leads,"BUDAPEST teszt").map(lead=>lead.id),["b"]);
 assert.deepEqual(searchLeads(leads,"nagy budapest").map(lead=>lead.id),[]);
 assert.equal(searchLeads(leads,"  "),leads);
});
test("sending delay starts at the send claim, and never marks a confirmed email late",()=>{
 const now=new Date("2026-09-20T12:00:00Z");
 assert.equal(isDelayedSending({status:"sending",sending_started_at:"2026-09-20T11:00:01Z"},now),false);
 assert.equal(isDelayedSending({status:"sending",sending_started_at:"2026-09-20T11:00:00Z"},now),true);
 assert.equal(isDelayedSending({status:"sent",sending_started_at:"2026-09-20T09:00:00Z"},now),false);
 assert.equal(isDelayedSending({status:"sending",sending_started_at:null},now),false);
 assert.equal(replyLabel("sending",new Date(Date.now()-61*60_000).toISOString()),"Küldési visszaigazolás késik");
});
test("closed leads remain available without appearing in active or attention views",()=>{
 const leads=[
   {id:"a",status:"new"},
   {id:"b",status:"processed"},
   {id:"c",status:"contacted"},
 ];
 const replies=new Map([
   ["a",{status:"draft"}],
   ["b",{status:"sending"}],
   ["c",{status:"sending"}],
 ]);
 assert.deepEqual(filterLeads(leads,replies,"active").map(lead=>lead.id),["a","c"]);
 assert.deepEqual(filterLeads(leads,replies,"closed").map(lead=>lead.id),["b"]);
 assert.deepEqual(filterLeads(leads,replies,"draft").map(lead=>lead.id),["a"]);
 assert.deepEqual(filterLeads(leads,replies,"sending").map(lead=>lead.id),["c"]);
 assert.deepEqual(filterLeads(leads,replies,"all").map(lead=>lead.id),["a","b","c"]);
});
test("delayed filter hides closed leads and recently started sends",()=>{
 const old=new Date(Date.now()-61*60_000).toISOString();
 const recent=new Date(Date.now()-10*60_000).toISOString();
 const leads=[{id:"a",status:"contacted"},{id:"b",status:"processed"},{id:"c",status:"new"}];
 const replies=new Map([["a",{status:"sending",sending_started_at:old}],["b",{status:"sending",sending_started_at:old}],["c",{status:"sending",sending_started_at:recent}]]);
 assert.deepEqual(filterLeads(leads,replies,"delayed").map(lead=>lead.id),["a"]);
});
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
