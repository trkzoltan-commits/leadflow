"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Lead = {
  id: string;
  company_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  service: string | null;
  description: string | null;
  location: string | null;
  priority: string | null;
  status: string | null;
  source: string | null;
  ai_summary: string | null;
};

type Message = {
  id: string;
  direction: string;
  sender: string | null;
  content: string;
  channel: string | null;
  status: string | null;
  created_at: string;
};

export default function LeadDetailsPage() {
  const router = useRouter();
  const params = useParams();

  const leadId = params.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [aiError, setAiError] = useState("");

  const [replyLoading, setReplyLoading] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyError, setReplyError] = useState("");

  const [draftMessageId, setDraftMessageId] = useState<string | null>(null);
  const [messageStatus, setMessageStatus] = useState<string | null>(null);

  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaveSuccess, setDraftSaveSuccess] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState("");

  const [markingSent, setMarkingSent] = useState(false);
  const [markSentError, setMarkSentError] = useState("");

  const [messageHistory, setMessageHistory] = useState<Message[]>([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");

  useEffect(() => {
    async function initializePage() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, company_id, name, email, phone, service, description, location, priority, status, source, ai_summary"
        )
        .eq("id", leadId)
        .single();

      if (error) {
        console.error("Lead betöltési hiba:", error);
        setLoading(false);
        return;
      }

      setLead(data);

      setName(data.name ?? "");
      setEmail(data.email ?? "");
      setPhone(data.phone ?? "");
      setService(data.service ?? "");
      setDescription(data.description ?? "");
      setLocation(data.location ?? "");
      setStatus(data.status ?? "new");
      setPriority(data.priority ?? "medium");
      setAiResult(data.ai_summary ?? "");

      const { data: messagesData, error: messagesError } = await supabase
        .from("messages")
        .select(
          "id, direction, sender, content, channel, status, created_at"
        )
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });

      if (messagesError) {
        console.error("Üzenetek betöltési hiba:", messagesError);
      }

      const messages = messagesData ?? [];

      setMessageHistory(messages);

      const latestOutgoing = [...messages]
        .reverse()
        .find((message) => message.direction === "outgoing");

      if (latestOutgoing) {
        setDraftMessageId(latestOutgoing.id);
        setReplyDraft(latestOutgoing.content ?? "");
        setMessageStatus(latestOutgoing.status ?? "draft");
      }

      setLoading(false);
    }

    initializePage();
  }, [leadId, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!lead) return;

    setSaving(true);
    setSaveSuccess(false);

    const { error } = await supabase
      .from("leads")
      .update({
        name,
        email,
        phone,
        service,
        description,
        location,
        status,
        priority,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    if (error) {
      console.error("Mentési hiba:", error);
      setSaving(false);
      return;
    }

    setLead({
      ...lead,
      name,
      email,
      phone,
      service,
      description,
      location,
      status,
      priority,
    });

    setSaving(false);
    setSaveSuccess(true);

    setTimeout(() => {
      setSaveSuccess(false);
    }, 2500);
  }

  async function handleAiAnalysis() {
    if (!lead) return;

    setAiLoading(true);
    setAiError("");

    try {
      const response = await fetch("/api/analyze-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          service,
          description,
          location,
          priority,
          status,
          source: lead.source,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Az AI-feldolgozás sikertelen.");
      }

      const result =
        data.result || "Az AI nem adott vissza eredményt.";

      const { error: saveAiError } = await supabase
        .from("leads")
        .update({
          ai_summary: result,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      if (saveAiError) {
        console.error("AI eredmény mentési hiba:", saveAiError);

        throw new Error(
          "Az AI elemzés elkészült, de nem sikerült elmenteni az adatbázisba."
        );
      }

      setAiResult(result);

      setLead({
        ...lead,
        ai_summary: result,
      });
    } catch (error) {
      console.error("AI feldolgozási hiba:", error);

      setAiError(
        error instanceof Error
          ? error.message
          : "Ismeretlen hiba történt az AI-feldolgozás során."
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function handleGenerateReply() {
    if (!lead) return;

    setReplyLoading(true);
    setReplyError("");
    setDraftSaveSuccess(false);
    setDraftSaveError("");
    setMarkSentError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
       throw new Error("A felhasználói munkamenet nem érhető el.");
      }
      
      const response = await fetch("/api/generate-reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          service,
          description,
          location,
          priority,
          status,
          source: lead.source,
          aiSummary: aiResult,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "A választervezet elkészítése sikertelen."
        );
      }

      setReplyDraft(
        data.reply || "Az AI nem adott vissza választervezetet."
      );

      if (messageStatus === "sent") {
        setDraftMessageId(null);
        setMessageStatus(null);
      }
    } catch (error) {
      console.error("Választervezet hiba:", error);

      setReplyError(
        error instanceof Error
          ? error.message
          : "Ismeretlen hiba történt a választervezet készítése során."
      );
    } finally {
      setReplyLoading(false);
    }
  }

  async function handleSaveDraft() {
    if (!lead || !replyDraft.trim()) return;

    setDraftSaving(true);
    setDraftSaveSuccess(false);
    setDraftSaveError("");
    setMarkSentError("");

    try {
      if (draftMessageId && messageStatus === "draft") {
        const { error } = await supabase
          .from("messages")
          .update({
            content: replyDraft,
          })
          .eq("id", draftMessageId);

        if (error) {
          throw error;
        }

        setMessageHistory((current) =>
          current.map((message) =>
            message.id === draftMessageId
              ? {
                  ...message,
                  content: replyDraft,
                }
              : message
          )
        );
      } else {
        const { data, error } = await supabase
          .from("messages")
          .insert({
            company_id: lead.company_id,
            lead_id: lead.id,
            direction: "outgoing",
            sender: "company",
            content: replyDraft,
            channel: lead.source || "manual",
            status: "draft",
          })
          .select(
            "id, direction, sender, content, channel, status, created_at"
          )
          .single();

        if (error) {
          throw error;
        }

        setDraftMessageId(data.id);
        setMessageStatus("draft");

        setMessageHistory((current) => [...current, data]);
      }

      setDraftSaveSuccess(true);

      setTimeout(() => {
        setDraftSaveSuccess(false);
      }, 2500);
    } catch (error) {
      console.error("Piszkozat mentési hiba:", error);

      setDraftSaveError(
        "Nem sikerült elmenteni a választervezetet."
      );
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleMarkAsSent() {
    if (!draftMessageId) return;

    setMarkingSent(true);
    setMarkSentError("");
    setDraftSaveSuccess(false);

    try {
      const { error } = await supabase
        .from("messages")
        .update({
          status: "sent",
          content: replyDraft,
        })
        .eq("id", draftMessageId);

      if (error) {
        throw error;
      }

      setMessageStatus("sent");

      setMessageHistory((current) =>
        current.map((message) =>
          message.id === draftMessageId
            ? {
                ...message,
                status: "sent",
                content: replyDraft,
              }
            : message
        )
      );
    } catch (error) {
      console.error("Elküldöttnek jelölési hiba:", error);

      setMarkSentError(
        "Nem sikerült elküldöttnek jelölni az üzenetet."
      );
    } finally {
      setMarkingSent(false);
    }
  }

  function getSourceLabel(source: string | null) {
    if (source === "manual") return "Kézi felvétel";
    if (source === "email") return "E-mail";
    if (source === "web") return "Weboldal";
    if (source === "messenger") return "Messenger";

    return source || "—";
  }

  function getMessageStatusLabel(messageStatus: string | null) {
    if (messageStatus === "draft") return "Piszkozat";
    if (messageStatus === "sent") return "Elküldött";
    if (messageStatus === "received") return "Beérkezett";

    return messageStatus || "—";
  }

  function getDirectionLabel(direction: string) {
    if (direction === "outgoing") return "Kimenő";
    if (direction === "incoming") return "Bejövő";

    return direction;
  }

  function getChannelLabel(channel: string | null) {
    if (channel === "manual") return "Kézi";
    if (channel === "email") return "E-mail";
    if (channel === "web") return "Weboldal";
    if (channel === "messenger") return "Messenger";

    return channel || "—";
  }

  function formatMessageDate(date: string) {
    return new Intl.DateTimeFormat("hu-HU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-lg font-semibold text-slate-600">
          Betöltés...
        </div>
      </main>
    );
  }

  if (!lead) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">
            Az érdeklődő nem található
          </h1>

          <button
            onClick={() => router.push("/leads")}
            className="mt-6 rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white"
          >
            Vissza az érdeklődőkhöz
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <button
            onClick={() => router.push("/leads")}
            className="mb-4 text-sm font-medium text-violet-600 hover:text-violet-700"
          >
            ← Vissza az érdeklődőkhöz
          </button>

          <h1 className="text-3xl font-bold text-slate-900">
            {name || "Névtelen érdeklődő"}
          </h1>

          <p className="mt-2 text-slate-500">
            Érdeklődő adatlap és szerkesztés
          </p>
        </div>

        <form onSubmit={handleSave}>
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-6 text-xl font-bold">
                  Kapcsolattartási adatok
                </h2>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Név
                    </label>

                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Telefonszám
                    </label>

                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      E-mail
                    </label>

                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Helyszín
                    </label>

                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-6 text-xl font-bold">
                  Érdeklődés
                </h2>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Szolgáltatás
                    </label>

                    <input
                      type="text"
                      value={service}
                      onChange={(e) => setService(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Leírás
                    </label>

                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="min-h-40 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                    />
                  </div>

                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      Forrás
                    </div>

                    <div className="mt-2 rounded-xl bg-slate-50 px-4 py-3 text-slate-700">
                      {getSourceLabel(lead.source)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900">
                  AI választervezet
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Az AI az érdeklődő adatai és a korábbi elemzés alapján
                  elkészíti a választervezetet.
                </p>

                <button
                  type="button"
                  onClick={handleGenerateReply}
                  disabled={replyLoading}
                  className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {replyLoading
                    ? "Válasz készítése..."
                    : replyDraft
                      ? "Új választervezet készítése"
                      : "Választervezet készítése"}
                </button>

                {replyError && (
                  <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {replyError}
                  </div>
                )}

                {replyDraft && (
                  <div className="mt-5">
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Válasz
                    </label>

                    <textarea
                      value={replyDraft}
                      onChange={(e) => {
                        setReplyDraft(e.target.value);
                        setDraftSaveSuccess(false);
                      }}
                      disabled={messageStatus === "sent"}
                      className="min-h-64 w-full rounded-xl border border-slate-200 px-4 py-3 leading-7 outline-none focus:border-violet-400 disabled:bg-slate-50 disabled:text-slate-600"
                    />

                    {messageStatus !== "sent" && (
                      <>
                        <button
                          type="button"
                          onClick={handleSaveDraft}
                          disabled={draftSaving || !replyDraft.trim()}
                          className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {draftSaving
                            ? "Piszkozat mentése..."
                            : "Piszkozat mentése"}
                        </button>

                        {draftMessageId && messageStatus === "draft" && (
                          <button
                            type="button"
                            onClick={handleMarkAsSent}
                            disabled={markingSent}
                            className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {markingSent
                              ? "Rögzítés..."
                              : "Elküldöttnek jelölés"}
                          </button>
                        )}

                        <p className="mt-3 text-xs leading-5 text-slate-500">
                          Az „Elküldöttnek jelölés” jelenleg csak a LeadFlow
                          rendszerben rögzíti az üzenetet elküldöttként.
                          Valódi e-mailt még nem küld.
                        </p>
                      </>
                    )}

                    {draftSaveSuccess && (
                      <div className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                        ✓ A piszkozat elmentve.
                      </div>
                    )}

                    {draftSaveError && (
                      <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                        {draftSaveError}
                      </div>
                    )}

                    {markSentError && (
                      <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                        {markSentError}
                      </div>
                    )}

                    {messageStatus === "sent" && (
                      <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                        ✓ Az üzenet elküldöttként van rögzítve.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Kommunikációs előzmények
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Az érdeklődőhöz tartozó korábbi üzenetek.
                    </p>
                  </div>

                  <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                    {messageHistory.length} üzenet
                  </div>
                </div>

                {messageHistory.length === 0 ? (
                  <div className="mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                    Még nincs mentett kommunikáció ehhez az érdeklődőhöz.
                  </div>
                ) : (
                  <div className="mt-6 space-y-4">
                    {messageHistory.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-2xl border p-5 ${
                          message.direction === "incoming"
                            ? "border-blue-100 bg-blue-50"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                              {getDirectionLabel(message.direction)}
                            </span>

                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                              {getMessageStatusLabel(message.status)}
                            </span>

                            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">
                              {getChannelLabel(message.channel)}
                            </span>
                          </div>

                          <div className="text-xs text-slate-500">
                            {formatMessageDate(message.created_at)}
                          </div>
                        </div>

                        <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                          {message.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-6 text-xl font-bold">
                  Érdeklődő kezelése
                </h2>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Állapot
                    </label>

                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                    >
                      <option value="new">Új</option>
                      <option value="waiting">Válaszra vár</option>
                      <option value="processed">Feldolgozott</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Prioritás
                    </label>

                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-400"
                    >
                      <option value="low">Alacsony</option>
                      <option value="medium">Közepes</option>
                      <option value="high">Magas</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Mentés..." : "Módosítások mentése"}
                  </button>

                  {saveSuccess && (
                    <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                      ✓ A módosítások elmentve.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 p-6 text-white shadow-lg">
                <div className="text-lg font-bold">
                  ✨ AI feldolgozás
                </div>

                {!aiResult && !aiError && (
                  <p className="mt-3 leading-7 text-violet-50">
                    Az AI elemzi az érdeklődőt, összefoglalja az igényt,
                    megkeresi a hiányzó információkat és javaslatot ad a
                    következő lépésre.
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleAiAnalysis}
                  disabled={aiLoading}
                  className="mt-5 w-full rounded-xl bg-white px-4 py-3 font-semibold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {aiLoading
                    ? "AI dolgozik..."
                    : aiResult
                      ? "AI elemzés újra"
                      : "AI feldolgozás indítása"}
                </button>

                {aiError && (
                  <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-700">
                    {aiError}
                  </div>
                )}

                {aiResult && (
                  <div className="mt-5 rounded-xl bg-white/10 p-4">
                    <div className="mb-2 font-semibold">
                      AI eredmény
                    </div>

                    <div className="whitespace-pre-wrap text-sm leading-6 text-white">
                      {aiResult}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}