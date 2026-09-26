import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const source = ts.transpileModule(readFileSync(new URL("../lib/lead-overview.ts", import.meta.url), "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const context={exports:{}, Intl, Date, Map}; vm.runInNewContext(source,context);
const {latestReplies,dailyCounts,replyLabel,filterLeads,isDelayedSending,searchLeads,outcomeLabel,newLeadDispatchWarning,missingAiDraftWarning,preferredReplyMessage}=context.exports;
test("missing AI draft warning starts after 15 minutes only for accepted, open leads without an outgoing reply",()=>{
 const now=new Date("2026-09-20T12:00:00Z");
 const lead={new_lead_dispatch_status:"accepted",status:"new",created_at:"2026-09-20T11:45:01Z"};
 assert.equal(missingAiDraftWarning(lead,false,now),null);
 assert.match(missingAiDraftWarning({...lead,created_at:"2026-09-20T11:45:00Z"},false,now),/15 perc/);
 assert.equal(missingAiDraftWarning({...lead,created_at:"2026-09-20T11:00:00Z"},true,now),null);
 assert.equal(missingAiDraftWarning({...lead,status:"processed",created_at:"2026-09-20T11:00:00Z"},false,now),null);
 assert.equal(missingAiDraftWarning({...lead,new_lead_dispatch_status:"uncertain",created_at:"2026-09-20T11:00:00Z"},false,now),null);
 assert.equal(missingAiDraftWarning({...lead,new_lead_dispatch_status:null,created_at:"2026-09-20T11:00:00Z"},false,now),null);
});
test("new lead Make dispatch warnings preserve uncertain delivery and ignore historical leads",()=>{
 const now=new Date("2026-09-20T12:00:00Z");
 assert.equal(newLeadDispatchWarning(null,"2026-09-20T10:00:00Z",now),null);
 assert.equal(newLeadDispatchWarning("accepted","2026-09-20T10:00:00Z",now),null);
 assert.equal(newLeadDispatchWarning("pending","2026-09-20T11:59:30Z",now),null);
 assert.match(newLeadDispatchWarning("pending","2026-09-20T11:59:00Z",now),/visszaigazolása késik/);
 assert.match(newLeadDispatchWarning("unconfigured","2026-09-20T12:00:00Z",now),/nem indult el/);
 assert.match(newLeadDispatchWarning("uncertain","2026-09-20T12:00:00Z",now),/nem igazolta vissza/);
});
test("Make attention filter matches the warning shown on the dashboard and lead list",()=>{
 const recent=new Date(Date.now()-30_000).toISOString();
 const old=new Date(Date.now()-61_000).toISOString();
 const leads=[
   {id:"a",status:"new",new_lead_dispatch_status:"unconfigured",created_at:recent},
   {id:"b",status:"new",new_lead_dispatch_status:"uncertain",created_at:recent},
   {id:"c",status:"new",new_lead_dispatch_status:"pending",created_at:old},
   {id:"d",status:"new",new_lead_dispatch_status:"pending",created_at:recent},
   {id:"e",status:"processed",new_lead_dispatch_status:null,created_at:old},
   {id:"f",status:"new",new_lead_dispatch_status:"accepted",created_at:new Date(Date.now()-16*60_000).toISOString()},
 ];
 assert.deepEqual(filterLeads(leads,new Map(),"make").map(lead=>lead.id),["a","b","c","f"]);
 assert.deepEqual(filterLeads(leads,new Map([["f",{status:"sent"}]]),"make").map(lead=>lead.id),["a","b","c"]);
});
test("closed outcome filter includes only matching closed leads and handles legacy missing outcomes",()=>{
 const leads=[{id:"a",status:"processed",outcome:"won"},{id:"b",status:"processed",outcome:"lost"},{id:"c",status:"processed",outcome:null},{id:"d",status:"new",outcome:"won"}];
 const replies=new Map();
 assert.deepEqual(filterLeads(leads,replies,"closed","won").map(lead=>lead.id),["a"]);
 assert.deepEqual(filterLeads(leads,replies,"closed","lost").map(lead=>lead.id),["b"]);
 assert.deepEqual(filterLeads(leads,replies,"closed","unknown").map(lead=>lead.id),["c"]);
 assert.deepEqual(filterLeads(leads,replies,"closed").map(lead=>lead.id),["a","b","c"]);
 assert.equal(outcomeLabel("won"),"Megvalósult");
 assert.equal(outcomeLabel("lost"),"Nem valósult meg");
 assert.equal(outcomeLabel(null),"Eredmény nincs rögzítve");
});
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


test("lead detail prefers an actionable draft over a newer automatic acknowledgement",()=>{
 const messages=[
  {id:"draft",direction:"outgoing",status:"draft",sender:"LeadFlow AI",created_at:"2026-09-25T19:59:52Z"},
  {id:"ack",direction:"outgoing",status:"sent",sender:"LeadFlow",created_at:"2026-09-25T19:59:54Z"},
 ];
 assert.equal(preferredReplyMessage(messages).id,"draft");
 assert.equal(preferredReplyMessage([{...messages[1]}]).id,"ack");
});
test("lead detail keeps the AI reply selected after it has been sent",()=>{
 const messages=[
  {id:"reply",direction:"outgoing",status:"sent",sender:"LeadFlow AI",created_at:"2026-09-25T19:59:52Z"},
  {id:"ack",direction:"outgoing",status:"sent",sender:"LeadFlow",created_at:"2026-09-25T19:59:54Z"},
 ];
 assert.equal(preferredReplyMessage(messages).id,"reply");
});
