export const STRUCTURED_DICTATION_MAX_LENGTH = 4000;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LeadDictationSuggestions = {
  service: string | null;
  location: string | null;
  description: string | null;
};

export function parseStructuredDictationInput(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.lead_id !== "string" || !uuidPattern.test(record.lead_id)) return null;
  if (typeof record.transcript !== "string") return null;
  const transcript = record.transcript.trim();
  if (transcript.length < 3 || transcript.length > STRUCTURED_DICTATION_MAX_LENGTH) return null;
  return { leadId: record.lead_id, transcript };
}

function optionalSuggestion(value: unknown, maxLength: number) {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("Érvénytelen AI-javaslat.");
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new Error("Túl hosszú AI-javaslat.");
  return normalized;
}

export function parseStructuredDictationOutput(outputText: string): LeadDictationSuggestions {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("Az AI nem adott feldolgozható javaslatot.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Az AI nem adott feldolgozható javaslatot.");
  }
  const record = parsed as Record<string, unknown>;
  return {
    service: optionalSuggestion(record.service, 160),
    location: optionalSuggestion(record.location, 160),
    description: optionalSuggestion(record.description, STRUCTURED_DICTATION_MAX_LENGTH),
  };
}
