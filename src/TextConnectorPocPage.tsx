import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchTextConnectorPocCatalog,
  normalizeTextConnectorWebhook,
} from "./api";
import type { RequestError } from "./api";
import type {
  AppSettings,
  TextConnectorAttachment,
  TextConnectorNormalizeResult,
  TextConnectorNormalizedEvent,
  TextConnectorPocCatalogItem,
} from "./types";
import { getIntlLocale } from "./i18n";

type Props = {
  settings: AppSettings;
  onUnauthorized: () => void;
};

type ReplayHistoryEntry = {
  id: string;
  normalized: TextConnectorNormalizedEvent;
  replayedAt: string;
  duplicate: boolean;
};

type JsonValidation =
  | { valid: true; value: unknown }
  | { valid: false; error: string };

const MAX_HISTORY_ITEMS = 20;
const DRAFTS_SESSION_KEY = "text-connector-poc-drafts";
const HISTORY_SESSION_KEY = "text-connector-poc-history";

const providerExamples: Record<string, unknown> = {
  chat2desk: {
    hook_type: "inbox",
    message_id: 501,
    dialog_id: 601,
    text: "Hello, I need help with my order.",
    client: { id: 701, name: "Customer" },
    channel_id: 801,
  },
  trengo: {
    type: "OUTBOUND",
    message: { id: 501, text: "I can help" },
    ticket: { id: 601 },
    user: { id: 701, name: "Operator" },
    channel: { id: 801 },
  },
  chatwoot: {
    event: "message_created",
    id: 501,
    content: "Thanks for contacting us.",
    message_type: "incoming",
    conversation: { id: 601, status: "open" },
    sender: { id: 701, name: "Customer", type: "contact" },
    inbox: { id: 801, name: "Support" },
  },
};

const checklistItems = [
  { id: "customer-text", label: "Customer text received" },
  { id: "operator-reply", label: "Operator reply received" },
  { id: "attachment", label: "Attachment metadata received" },
  { id: "closed", label: "Conversation close received" },
  { id: "reopened", label: "Conversation reopen received" },
  { id: "duplicate", label: "Duplicate webhook produces the same event ID" },
  { id: "agent", label: "Agent identity is present" },
  { id: "history", label: "History reconciliation verified", manual: true },
] as const;

const errorStatus = (error: unknown) =>
  error && typeof error === "object" && "status" in error
    ? (error as RequestError).status
    : undefined;

const safeErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof TypeError) {
    return "The service could not be reached. Check your connection and try again.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

const providerKey = (provider: string) =>
  provider.toLowerCase().replace(/[^a-z0-9]/g, "");

const exampleForProvider = (provider: string) =>
  providerExamples[providerKey(provider)] ?? {
    event: "message_created",
    conversation_id: "conversation-601",
    message_id: "message-501",
    text: "Example webhook message",
  };

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const readSessionJson = <T,>(key: string, fallback: T): T => {
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
};

const writeSessionJson = (key: string, value: unknown) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Session-only persistence is best effort; the active React state remains authoritative.
  }
};

const readSessionDrafts = (key: string) => {
  const value = readSessionJson<unknown>(key, {});
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce<Record<string, string>>((drafts, [provider, draft]) => {
    if (typeof draft === "string") drafts[provider] = draft;
    return drafts;
  }, {});
};

const readSessionHistory = (key: string) => {
  const value = readSessionJson<unknown>(key, []);
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ReplayHistoryEntry => Boolean(
      item &&
      typeof item === "object" &&
      "normalized" in item &&
      (item as { normalized?: unknown }).normalized &&
      typeof (item as { normalized?: unknown }).normalized === "object",
    ))
    .slice(0, MAX_HISTORY_ITEMS);
};

const safeExternalUrl = (value?: string | null) => {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
};

const validateJson = (draft: string): JsonValidation => {
  if (!draft.trim()) {
    return { valid: false, error: "Enter or load a webhook payload." };
  }
  try {
    return { valid: true, value: JSON.parse(draft) as unknown };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof SyntaxError ? `Invalid JSON: ${error.message}` : "Invalid JSON.",
    };
  }
};

const displayValue = (value?: string | null) => value?.trim() || "—";

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(getIntlLocale(), {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(date);
};

const humanize = (value?: string | null) =>
  displayValue(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const eventBadgeClass = (eventType: string) => {
  const value = eventType.toLowerCase();
  if (value.includes("message")) return "text-badge-message";
  if (value.includes("close")) return "text-badge-closed";
  if (value.includes("open") || value.includes("reopen")) return "text-badge-opened";
  return "text-badge-event";
};

const semanticBadgeClass = (value?: string | null) => {
  switch (value?.trim().toLowerCase()) {
    case "customer":
      return "text-badge-customer";
    case "agent":
      return "text-badge-agent";
    case "bot":
      return "text-badge-bot";
    case "system":
      return "text-badge-system";
    case "inbound":
      return "text-badge-inbound";
    case "outbound":
      return "text-badge-outbound";
    case "opened":
    case "open":
      return "text-badge-opened";
    case "closed":
      return "text-badge-closed";
    default:
      return "text-badge-event";
  }
};

const attachmentSummary = (attachment: TextConnectorAttachment, index: number) => {
  const name =
    attachment.fileName ??
    attachment.filename ??
    attachment.name ??
    attachment.id ??
    `Attachment ${index + 1}`;
  const type = attachment.contentType ?? attachment.content_type ?? attachment.type;
  const url = attachment.url ?? attachment.downloadUrl ?? attachment.download_url;
  return {
    name: String(name),
    type: type == null ? "" : String(type),
    url: typeof url === "string" ? safeExternalUrl(url) : "",
  };
};

function ProviderCatalogCard({
  item,
  selected,
  onSelect,
}: {
  item: TextConnectorPocCatalogItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`text-provider-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="text-provider-mark" aria-hidden="true">
        {item.displayName.slice(0, 2).toUpperCase()}
      </span>
      <span>
        <strong>{item.displayName}</strong>
        <small>{item.provider}</small>
      </span>
      <span className="text-provider-history">
        {item.supportsHistoryApi ? "History API" : "No history API"}
      </span>
    </button>
  );
}

function EventSummary({
  result,
  onCopy,
}: {
  result: TextConnectorNormalizeResult;
  onCopy: (value: string, successMessage: string) => void;
}) {
  const event = result.normalized;
  return (
    <section className="text-result" aria-labelledby="normalized-result-title">
      <div className="text-section-heading">
        <div>
          <span className="text-kicker">Latest replay</span>
          <h2 id="normalized-result-title">Normalized result</h2>
        </div>
        <button
          type="button"
          className="secondary-button small-button"
          onClick={() => onCopy(event.eventId, "Event ID copied.")}
          disabled={!event.eventId}
        >
          Copy event ID
        </button>
      </div>

      <div className="text-result-badges" aria-label="Normalized event classifications">
        <span className={`text-semantic-badge ${eventBadgeClass(event.eventType)}`}>
          Event: {humanize(event.eventType)}
        </span>
        {event.providerEventType ? (
          <span className="text-semantic-badge text-badge-event">
            Provider event: {event.providerEventType}
          </span>
        ) : null}
        {event.direction ? (
          <span className={`text-semantic-badge ${semanticBadgeClass(event.direction)}`}>
            Direction: {humanize(event.direction)}
          </span>
        ) : null}
        {event.senderRole ? (
          <span className={`text-semantic-badge ${semanticBadgeClass(event.senderRole)}`}>
            Sender: {humanize(event.senderRole)}
          </span>
        ) : null}
      </div>

      <dl className="text-event-grid">
        <div><dt>Conversation ID</dt><dd>{displayValue(event.externalConversationId)}</dd></div>
        <div><dt>Message ID</dt><dd>{displayValue(event.externalMessageId)}</dd></div>
        <div><dt>Channel</dt><dd>{displayValue(event.channel)}</dd></div>
        <div><dt>Channel ID</dt><dd>{displayValue(event.channelId)}</dd></div>
        <div><dt>Sender ID</dt><dd>{displayValue(event.senderExternalId)}</dd></div>
        <div><dt>Sender name</dt><dd>{displayValue(event.senderName)}</dd></div>
        <div><dt>Timestamp</dt><dd>{formatDateTime(event.occurredAt)}</dd></div>
        <div><dt>Hydration required</dt><dd>{event.requiresHydration ? "Yes" : "No"}</dd></div>
        <div className="text-event-id"><dt>Deduplication event ID</dt><dd>{displayValue(event.eventId)}</dd></div>
      </dl>

      <div className="text-message-preview">
        <h3>Message text</h3>
        <p data-i18n-skip>{displayValue(event.text)}</p>
      </div>

      <div className="text-result-columns">
        <section>
          <h3>Attachments <span>{event.attachments.length}</span></h3>
          {event.attachments.length ? (
            <ul className="text-attachment-list">
              {event.attachments.map((attachment, index) => {
                const summary = attachmentSummary(attachment, index);
                return (
                  <li key={`${summary.name}-${index}`}>
                    <strong>{summary.name}</strong>
                    {summary.type ? <span>{summary.type}</span> : null}
                    {summary.url ? (
                      <a href={summary.url} target="_blank" rel="noreferrer">Open attachment</a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-empty-copy">No attachment metadata.</p>}
        </section>
        <section>
          <h3>Warnings <span>{event.warnings.length}</span></h3>
          {event.warnings.length ? (
            <ul className="text-warning-list">
              {event.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
            </ul>
          ) : <p className="text-empty-copy">No normalization warnings.</p>}
        </section>
      </div>

      <div className="text-json-viewers">
        <details>
          <summary>Normalized event JSON</summary>
          <div className="text-json-viewer-actions">
            <button type="button" className="secondary-button small-button" onClick={() => onCopy(prettyJson(event), "Normalized JSON copied.")}>Copy normalized JSON</button>
          </div>
          <pre data-i18n-skip>{prettyJson(event)}</pre>
        </details>
        <details>
          <summary>Original source payload</summary>
          <pre data-i18n-skip>{prettyJson(result.sourcePayload)}</pre>
        </details>
      </div>
    </section>
  );
}

export function TextConnectorPocPage({ settings, onUnauthorized }: Props) {
  const onUnauthorizedRef = useRef(onUnauthorized);
  const [catalog, setCatalog] = useState<TextConnectorPocCatalogItem[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    readSessionDrafts(`${DRAFTS_SESSION_KEY}:${settings.companyId}`),
  );
  const [results, setResults] = useState<Record<string, TextConnectorNormalizeResult>>({});
  const [history, setHistory] = useState<ReplayHistoryEntry[]>(() =>
    readSessionHistory(`${HISTORY_SESSION_KEY}:${settings.companyId}`),
  );
  const [checklists, setChecklists] = useState<Record<string, Record<string, boolean>>>({});
  const [providerFilter, setProviderFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [normalizing, setNormalizing] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [pageError, setPageError] = useState("");
  const [replayError, setReplayError] = useState("");
  const [notification, setNotification] = useState("");

  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  useEffect(() => {
    writeSessionJson(`${DRAFTS_SESSION_KEY}:${settings.companyId}`, drafts);
  }, [drafts, settings.companyId]);

  useEffect(() => {
    writeSessionJson(`${HISTORY_SESSION_KEY}:${settings.companyId}`, history);
  }, [history, settings.companyId]);

  const handleAuthorizationError = useCallback((error: unknown) => {
    if (errorStatus(error) === 401) {
      onUnauthorizedRef.current();
      return true;
    }
    if (errorStatus(error) === 403) {
      setAccessDenied(true);
      return true;
    }
    return false;
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setPageError("");
    setAccessDenied(false);
    try {
      const nextCatalog = await fetchTextConnectorPocCatalog(settings);
      setCatalog(nextCatalog);
      setDrafts((current) => nextCatalog.reduce<Record<string, string>>((next, item) => {
        next[item.provider] = current[item.provider] ?? "";
        return next;
      }, {}));
      setSelectedProvider((current) =>
        nextCatalog.some((item) => item.provider === current)
          ? current
          : nextCatalog[0]?.provider ?? "",
      );
    } catch (error) {
      if (!handleAuthorizationError(error)) {
        setPageError(
          errorStatus(error) === 404
            ? "The Text Connector PoC catalog endpoint was not found. Confirm the backend PoC API is enabled, then retry."
            : safeErrorMessage(error, "Unable to load the Text Connector PoC catalog."),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [handleAuthorizationError, settings]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const provider = useMemo(
    () => catalog.find((item) => item.provider === selectedProvider) ?? null,
    [catalog, selectedProvider],
  );
  const draft = selectedProvider ? drafts[selectedProvider] ?? "" : "";
  const validation = useMemo(() => validateJson(draft), [draft]);
  const result = selectedProvider ? results[selectedProvider] ?? null : null;
  const checklist = selectedProvider ? checklists[selectedProvider] ?? {} : {};

  const eventTypes = useMemo(
    () => Array.from(new Set(history.map((entry) => entry.normalized.eventType))).sort(),
    [history],
  );
  const filteredHistory = useMemo(
    () => history.filter((entry) =>
      (!providerFilter || entry.normalized.provider === providerFilter) &&
      (!eventFilter || entry.normalized.eventType === eventFilter)),
    [eventFilter, history, providerFilter],
  );

  const updateDraft = (value: string) => {
    if (!selectedProvider) return;
    setDrafts((current) => ({ ...current, [selectedProvider]: value }));
    setReplayError("");
    setNotification("");
  };

  const copyText = async (value: string, successMessage: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(value);
      setNotification(successMessage);
      setReplayError("");
    } catch (error) {
      setReplayError(safeErrorMessage(error, "Unable to copy to the clipboard."));
    }
  };

  const formatDraft = () => {
    if (!validation.valid) {
      setReplayError(validation.error);
      return;
    }
    updateDraft(prettyJson(validation.value));
    setNotification("JSON formatted.");
  };

  const normalize = async () => {
    if (!provider || !validation.valid || normalizing) return;
    setNormalizing(true);
    setReplayError("");
    setNotification("");
    try {
      const nextResult = await normalizeTextConnectorWebhook(
        settings,
        provider.provider,
        validation.value,
      );
      const eventId = nextResult.normalized.eventId;
      const duplicate = Boolean(eventId && history.some((entry) => entry.normalized.eventId === eventId));
      const entry: ReplayHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        normalized: nextResult.normalized,
        replayedAt: new Date().toISOString(),
        duplicate,
      };
      setResults((current) => ({ ...current, [provider.provider]: nextResult }));
      setHistory((current) => [entry, ...current].slice(0, MAX_HISTORY_ITEMS));
      setNotification("Webhook normalized. No messages were persisted and no AI analysis was started.");
    } catch (error) {
      if (!handleAuthorizationError(error)) {
        const status = errorStatus(error);
        setReplayError(
          status === 400
            ? `The provider payload is invalid. ${safeErrorMessage(error, "Review the JSON and try again.")}`
            : status === 404
              ? "This provider normalizer was not found. Reload the catalog and try again."
              : safeErrorMessage(error, "Unable to normalize the webhook payload. Try again."),
        );
      }
    } finally {
      setNormalizing(false);
    }
  };

  if (accessDenied) {
    return (
      <section className="panel permission-denied" role="alert">
        <h1>Permission denied</h1>
        <p>Administrator access is required to use the Text Connector PoC.</p>
      </section>
    );
  }

  return (
    <section className="panel text-connector-page">
      <header className="text-connector-heading">
        <div>
          <span className="text-kicker">Admin · Proof of concept</span>
          <h1>Text Connector PoC</h1>
          <p>Replay and compare Chat2Desk, Trengo, and Chatwoot webhook payloads against the backend normalizers.</p>
        </div>
        <span className="text-poc-badge">PoC replay tool</span>
      </header>

      <div className="text-safety-note" role="note">
        <strong>Normalization only</strong>
        <p>This is not a production webhook configuration screen. Replaying a payload does not persist messages or start AI analysis.</p>
      </div>

      {notification ? <div className="connector-toast text-connector-toast" role="status">{notification}</div> : null}
      {pageError ? (
        <div className="connector-page-error" role="alert">
          <p>{pageError}</p>
          <button type="button" className="secondary-button" onClick={() => void loadCatalog()}>Retry catalog</button>
        </div>
      ) : null}

      {loading ? (
        <div className="text-catalog-skeleton" aria-label="Loading text connector catalog"><span /><span /><span /></div>
      ) : catalog.length === 0 && !pageError ? (
        <div className="connector-empty">
          <h2>No text connector providers available</h2>
          <p>The backend catalog did not return any providers.</p>
          <button type="button" className="secondary-button" onClick={() => void loadCatalog()}>Retry catalog</button>
        </div>
      ) : catalog.length ? (
        <>
          <section className="text-catalog-section" aria-labelledby="text-providers-title">
            <div className="text-section-heading">
              <div><span className="text-kicker">Backend catalog</span><h2 id="text-providers-title">Provider selection</h2></div>
            </div>
            <div className="text-provider-grid">
              {catalog.map((item) => (
                <ProviderCatalogCard
                  key={item.provider}
                  item={item}
                  selected={item.provider === selectedProvider}
                  onSelect={() => {
                    setSelectedProvider(item.provider);
                    setReplayError("");
                    setNotification("");
                  }}
                />
              ))}
            </div>
          </section>

          {provider ? (
            <>
              <section className="text-provider-detail" aria-labelledby="provider-capabilities-title">
                <div className="text-section-heading">
                  <div><span className="text-kicker">{provider.provider}</span><h2 id="provider-capabilities-title">{provider.displayName} capabilities</h2></div>
                  {safeExternalUrl(provider.documentationUrl) ? (
                    <a href={safeExternalUrl(provider.documentationUrl)} target="_blank" rel="noreferrer" className="secondary-button text-doc-link">Provider documentation ↗</a>
                  ) : null}
                </div>
                <div className="text-capability-grid">
                  <div><h3>Message events</h3>{provider.messageEvents.length ? <div className="text-event-chips">{provider.messageEvents.map((event) => <span key={event}>{event}</span>)}</div> : <p>No message events listed.</p>}</div>
                  <div><h3>Conversation events</h3>{provider.conversationEvents.length ? <div className="text-event-chips">{provider.conversationEvents.map((event) => <span key={event}>{event}</span>)}</div> : <p>No conversation events listed.</p>}</div>
                  <div className="text-validation-note"><h3>History validation {provider.supportsHistoryApi ? <span className="text-support-badge">Supported</span> : null}</h3><p>{provider.historyValidationNote || "No history validation note was provided."}</p><strong>Manual check</strong></div>
                  <div className="text-validation-note"><h3>Live webhook security</h3><p>{provider.securityValidationNote || "No security validation note was provided."}</p><strong>Manual check</strong></div>
                </div>
              </section>

              <div className="text-lab-grid">
                <section className="text-editor-panel" aria-labelledby="webhook-editor-title">
                  <div className="text-section-heading"><div><span className="text-kicker">{provider.displayName}</span><h2 id="webhook-editor-title">Webhook replay editor</h2></div></div>
                  <div className="text-editor-actions" role="toolbar" aria-label="Webhook JSON actions">
                    <button type="button" className="secondary-button small-button" onClick={formatDraft}>Format JSON</button>
                    <button type="button" className="secondary-button small-button" onClick={() => { updateDraft(""); setNotification("Editor cleared."); }}>Clear</button>
                    <button type="button" className="secondary-button small-button" onClick={() => void copyText(draft, "Webhook JSON copied.")} disabled={!draft}>Copy</button>
                    <button type="button" className="secondary-button small-button" onClick={() => { updateDraft(prettyJson(exampleForProvider(provider.provider))); setNotification(`${provider.displayName} example loaded.`); }}>Load Example</button>
                  </div>
                  <label htmlFor="text-webhook-json">Raw provider webhook JSON</label>
                  <textarea
                    id="text-webhook-json"
                    className="text-json-editor"
                    value={draft}
                    onChange={(event) => updateDraft(event.target.value)}
                    spellCheck={false}
                    aria-invalid={!validation.valid && Boolean(draft)}
                    aria-describedby="text-json-validation"
                    placeholder="Paste a raw provider webhook payload, or load an example."
                  />
                  <p id="text-json-validation" className={`text-json-validation ${validation.valid ? "is-valid" : "is-invalid"}`} role={draft && !validation.valid ? "alert" : undefined}>
                    {validation.valid ? "Valid JSON. Ready to normalize." : validation.error}
                  </p>
                  {replayError ? <div className="inline-error text-replay-error" role="alert"><p>{replayError}</p><button type="button" className="secondary-button small-button" onClick={() => void normalize()} disabled={!validation.valid || normalizing}>Retry normalize</button></div> : null}
                  <button type="button" className="text-normalize-button" onClick={() => void normalize()} disabled={!validation.valid || normalizing}>
                    {normalizing ? "Normalizing…" : "Normalize webhook"}
                  </button>
                </section>

                <section className="text-checklist-panel" aria-labelledby="validation-checklist-title">
                  <div className="text-section-heading"><div><span className="text-kicker">Session only</span><h2 id="validation-checklist-title">PoC validation checklist</h2></div></div>
                  <p>Checklist state stays in memory and is never written to browser storage.</p>
                  <div className="text-checklist">
                    {checklistItems.map((item) => {
                      const id = `text-check-${provider.provider}-${item.id}`;
                      return (
                        <label key={item.id} htmlFor={id}>
                          <input
                            id={id}
                            type="checkbox"
                            checked={Boolean(checklist[item.id])}
                            onChange={(event) => setChecklists((current) => ({
                              ...current,
                              [provider.provider]: {
                                ...current[provider.provider],
                                [item.id]: event.target.checked,
                              },
                            }))}
                          />
                          <span>{item.label}{"manual" in item && item.manual ? <small>Manual check</small> : null}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="text-manual-note" role="note"><strong>Manual validation required</strong><p>History reconciliation and live webhook signature/security validation cannot be proven by replay normalization alone.</p></div>
                </section>
              </div>

              {result ? <EventSummary result={result} onCopy={(value, message) => void copyText(value, message)} /> : (
                <div className="text-result-empty"><h2>No normalized result yet</h2><p>Load or paste a valid payload, then normalize it to inspect the canonical event.</p></div>
              )}
            </>
          ) : null}

          <section className="text-history" aria-labelledby="replay-history-title">
            <div className="text-section-heading"><div><span className="text-kicker">Most recent {MAX_HISTORY_ITEMS}</span><h2 id="replay-history-title">Replay comparison</h2></div><button type="button" className="secondary-button small-button" onClick={() => { setHistory([]); setProviderFilter(""); setEventFilter(""); setNotification("Replay history cleared."); }} disabled={!history.length}>Clear History</button></div>
            <div className="text-history-filters">
              <label>Provider<select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}><option value="">All providers</option>{catalog.map((item) => <option key={item.provider} value={item.provider}>{item.displayName}</option>)}</select></label>
              <label>Event type<select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}><option value="">All event types</option>{eventTypes.map((event) => <option key={event} value={event}>{event}</option>)}</select></label>
            </div>
            {filteredHistory.length ? (
              <div className="text-history-table-wrap">
                <table className="text-history-table">
                  <thead><tr><th>Provider</th><th>Event type</th><th>Conversation ID</th><th>Message ID</th><th>Sender role</th><th>Event ID</th><th>Time replayed</th></tr></thead>
                  <tbody>{filteredHistory.map((entry) => <tr key={entry.id} className={entry.duplicate ? "is-duplicate" : ""}>
                    <td data-label="Provider">{entry.normalized.provider}</td>
                    <td data-label="Event type"><span className={`text-semantic-badge ${eventBadgeClass(entry.normalized.eventType)}`}>{entry.normalized.eventType}</span></td>
                    <td data-label="Conversation ID">{displayValue(entry.normalized.externalConversationId)}</td>
                    <td data-label="Message ID">{displayValue(entry.normalized.externalMessageId)}</td>
                    <td data-label="Sender role"><span className={`text-semantic-badge ${semanticBadgeClass(entry.normalized.senderRole)}`}>{humanize(entry.normalized.senderRole)}</span></td>
                    <td data-label="Event ID"><span>{displayValue(entry.normalized.eventId)}</span>{entry.duplicate ? <strong className="text-duplicate-badge">Duplicate</strong> : null}</td>
                    <td data-label="Time replayed">{formatDateTime(entry.replayedAt)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            ) : <div className="text-result-empty compact"><p>{history.length ? "No replay results match these filters." : "No replay history yet."}</p></div>}
          </section>
        </>
      ) : null}
    </section>
  );
}
