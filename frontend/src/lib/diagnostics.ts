import { supabase } from "./supabase";

export type DiagnosticLevel = "debug" | "info" | "warn" | "error";
export type DiagnosticInput = {
  level?: DiagnosticLevel;
  source: "conversation" | "gemini-live" | "supabase" | "browser";
  event: string;
  message?: string;
  userId?: string | null;
  sessionId?: string | null;
  correlationId?: string | null;
  turnId?: string | null;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

const REDACT_KEYS = /token|authorization|secret|password|api.?key|credential|transcript|prompt|content|message|audio|payload|cookie/i;

function safeMetadata(input: Record<string, unknown> = {}) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (REDACT_KEYS.test(key)) { output[key] = "[REDACTED]"; continue; }
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      output[key] = typeof value === "string" ? value.slice(0, 300) : value;
    } else if (Array.isArray(value)) output[key] = "[array:" + value.length + "]";
    else if (typeof value === "object") output[key] = "[object]";
  }
  return output;
}

export function newDiagnosticId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "voxme-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

export function errorDetails(error: unknown) {
  if (error instanceof Error) return { errorName: error.name, errorMessage: error.message.slice(0, 500) };
  return { errorName: "UnknownError", errorMessage: String(error).slice(0, 500) };
}

export function logConversationEvent(input: DiagnosticInput) {
  const level = input.level || "info";
  const event = {
    timestamp: new Date().toISOString(), level, source: input.source, event: input.event,
    message: input.message || input.event, correlationId: input.correlationId || null,
    turnId: input.turnId || null, sessionId: input.sessionId || null,
    durationMs: input.durationMs ?? null, metadata: safeMetadata(input.metadata),
  };
  const writer = level === "error" ? console.error : level === "warn" ? console.warn : level === "debug" ? console.debug : console.info;
  writer("[VOXME]", event);
  if (!supabase || !input.userId || level === "debug") return;
  void supabase.from("conversation_logs").insert({
    user_id: input.userId, session_id: input.sessionId || null,
    correlation_id: input.correlationId || null, turn_id: input.turnId || null,
    level, source: input.source, event: input.event, message: event.message.slice(0, 500),
    duration_ms: input.durationMs ?? null, metadata: event.metadata,
  }).then(({ error }) => {
    if (error) console.warn("[VOXME] diagnostic persistence failed", { code: error.code, message: error.message });
  }).catch((error: unknown) => console.warn("[VOXME] diagnostic persistence unavailable", errorDetails(error)));
}

export function installBrowserDiagnostics(userId: string) {
  const onError = (event: ErrorEvent) => logConversationEvent({
    level: "error", source: "browser", event: "browser.unhandled_error", userId,
    message: event.message || "Unhandled browser error",
    metadata: { filename: event.filename, line: event.lineno, column: event.colno },
  });
  const onRejection = (event: PromiseRejectionEvent) => logConversationEvent({
    level: "error", source: "browser", event: "browser.unhandled_rejection", userId,
    ...errorDetails(event.reason),
  });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  logConversationEvent({ source: "browser", event: "browser.diagnostics_installed", userId, metadata: { online: navigator.onLine, userAgent: navigator.userAgent, language: navigator.language } });
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
