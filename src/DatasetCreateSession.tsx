import { useEffect, useRef, useState, type FormEvent } from "react";
import { createAnnotationSession, fetchAnnotationSources, type RequestError } from "./api";
import type { AppSettings, SttProvider } from "./types";
import type { AnnotationPage, AnnotationSource, CreateAnnotationSession } from "./datasetStudioTypes";
import { formatClipTime } from "./datasetStudioModel";
import { getIntlLocale } from "./i18n";

type Props = {
  settings: AppSettings;
  onCreated: (id: string) => void;
  onCancel: () => void;
  onUnauthorized: () => void;
};

export function DatasetCreateSession({ settings, onCreated, onCancel, onUnauthorized }: Props) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<SttProvider>("gcp");
  const [model, setModel] = useState("chirp_3");
  const [language, setLanguage] = useState<CreateAnnotationSession["language"]>("auto");
  const [min, setMin] = useState("10");
  const [max, setMax] = useState("15");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sources, setSources] = useState<AnnotationPage<AnnotationSource> | null>(null);
  const [selected, setSelected] = useState(new Map<number, string>());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const callbacks = useRef({ onCreated, onUnauthorized });
  callbacks.current = { onCreated, onUnauthorized };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSourceError("");
    const timer = window.setTimeout(() => {
      void fetchAnnotationSources(settings, search.trim(), page, controller.signal).then((result) => {
        if (!controller.signal.aborted) setSources(result);
      }).catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if ((reason as RequestError).status === 401) callbacks.current.onUnauthorized();
        setSourceError(reason instanceof Error ? reason.message : "Unable to load recordings.");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [settings.baseUrl, settings.companyId, settings.accessToken, search, page, attempt]);

  const validDurations = Boolean(min.trim() && max.trim()) && Number.isFinite(Number(min)) && Number.isFinite(Number(max)) &&
    Number(min) >= 1 && Number(max) <= 30 && Number(min) <= Number(max);
  const valid = name.trim() && selected.size >= 1 && selected.size <= 200 && validDurations &&
    (provider !== "gcp" || model.trim()) && (provider !== "openai" || model === "whisper-1");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || creating) return;
    setCreating(true);
    setError("");
    try {
      const result = await createAnnotationSession(settings, {
        name: name.trim(), conversationIds: [...selected.keys()], provider,
        model: model.trim() || null, language, minClipSeconds: Number(min), maxClipSeconds: Number(max),
      });
      if (mounted.current) callbacks.current.onCreated(result.id);
    } catch (reason) {
      if (!mounted.current) return;
      if ((reason as RequestError).status === 401) callbacks.current.onUnauthorized();
      setError(reason instanceof Error ? reason.message : "Unable to create the session.");
    } finally { if (mounted.current) setCreating(false); }
  };

  return <section className="dataset-card" aria-label="Create annotation session">
    <div className="section-heading"><h2>Create session</h2><p>Choose recordings and transcription settings. Transcription starts automatically.</p></div>
    <form onSubmit={(event) => void submit(event)}>
      <fieldset disabled={creating} className="dataset-fields">
        <legend className="sr-only">Session configuration</legend>
        <label>Session name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Armenian support calls" /></label>
        <div className="dataset-form-grid">
          <label>STT provider<select value={provider} onChange={(event) => {
            const next = event.target.value as SttProvider;
            setProvider(next); setModel(next === "gcp" ? "chirp_3" : next === "openai" ? "whisper-1" : "");
          }}><option value="gcp">Google Cloud (GCP)</option><option value="openai">OpenAI</option><option value="custom">Custom</option></select></label>
          <label>Model{provider === "openai" ? <select value="whisper-1" disabled><option value="whisper-1">whisper-1</option></select> :
            <input required={provider === "gcp"} value={model} placeholder={provider === "custom" ? "Provider default (optional)" : "chirp_3"} onChange={(event) => setModel(event.target.value)} />}</label>
          <label>Language<select value={language} onChange={(event) => setLanguage(event.target.value as CreateAnnotationSession["language"])}>
            <option value="auto">Automatic / multilingual</option><option value="hy">Armenian / Հայերեն</option><option value="en">English</option><option value="ru">Russian / Русский</option>
          </select></label>
          <div className="dataset-form-grid">
            <label>Minimum clip seconds<input type="number" required min="1" max="30" step="any" value={min} onChange={(event) => setMin(event.target.value)} /></label>
            <label>Maximum clip seconds<input type="number" required min="1" max="30" step="any" value={max} onChange={(event) => setMax(event.target.value)} /></label>
          </div>
        </div>
        {!validDurations && <p className="dataset-error" role="alert">Duration targets must satisfy 1 ≤ minimum ≤ maximum ≤ 30 seconds.</p>}
        {provider === "openai" && <p className="dataset-notice">OpenAI annotation supports only whisper-1 because word timestamps are required. Its retirement is scheduled for February 26, 2027.</p>}
        <p className="dataset-notice">Selected recordings will be sent to the chosen {provider === "gcp" ? "Google Cloud" : provider === "openai" ? "OpenAI" : "custom"} STT service for transcription.</p>
        <div className="dataset-heading-row"><h3>Select recordings</h3><strong aria-live="polite">{selected.size} / 200 selected</strong></div>
        <label>Search recordings<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by recording name" /></label>
        <div className="dataset-heading-row">
          <button className="secondary-button small-button" type="button" disabled={loading || Boolean(sourceError) || !sources?.items.length || selected.size >= 200} onClick={() => setSelected((previous) => {
            const next = new Map(previous);
            for (const source of sources?.items ?? []) { if (next.size >= 200) break; next.set(source.id, source.name); }
            return next;
          })}>Select this page</button>
          <button className="secondary-button small-button" type="button" disabled={!selected.size} onClick={() => setSelected(new Map())}>Clear selection</button>
        </div>
        {selected.size > 0 && <details className="dataset-selected"><summary>Selected recordings ({selected.size})</summary>
          <div className="dataset-selection-list">{[...selected].map(([id, title]) => <button data-i18n-skip className="secondary-button small-button" key={id} type="button" aria-label={`Remove ${title}`} onClick={() => setSelected((previous) => { const next = new Map(previous); next.delete(id); return next; })}>{title} ×</button>)}</div>
        </details>}
        {sourceError && <div className="form-message error-message" role="alert">{sourceError} <button type="button" className="secondary-button small-button" onClick={() => setAttempt((value) => value + 1)}>Retry recordings</button></div>}
        <div className="dataset-source-list" aria-busy={loading}>
          {loading ? <p className="empty-state" role="status">Loading recordings…</p> : !sourceError && !sources?.items.length ? <div className="empty-state"><h3>No recordings found</h3><p>Try another search or upload audio through the existing upload flow.</p></div> : !sourceError && sources?.items.map((source) => <label className="dataset-source" key={source.id}>
            <input data-i18n-skip type="checkbox" aria-label={source.name} checked={selected.has(source.id)} disabled={selected.size >= 200 && !selected.has(source.id)} onChange={(event) => {
              const checked = event.target.checked;
              setSelected((previous) => {
                const next = new Map(previous);
                if (checked && next.size < 200) next.set(source.id, source.name); else next.delete(source.id);
                return next;
              });
            }} />
            <span><strong data-i18n-skip>{source.name}</strong><small>{new Date(source.createdAt).toLocaleString(getIntlLocale())} · {source.durationSeconds === null ? "Duration unavailable" : formatClipTime(source.durationSeconds)}</small></span>
          </label>)}
        </div>
        <div className="dataset-pagination" aria-label="Recording pages">
          <button className="secondary-button small-button" type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous recordings</button>
          <span>Page {page} of {Math.max(1, Math.ceil((sources?.total ?? 0) / (sources?.pageSize || 50)))} · {sources?.total ?? 0} recordings</span>
          <button className="secondary-button small-button" type="button" disabled={loading || !sources || page * sources.pageSize >= sources.total} onClick={() => setPage((value) => value + 1)}>Next recordings</button>
        </div>
      </fieldset>
      {error && <div className="form-message error-message" role="alert">{error}</div>}
      <div className="dataset-actions"><button className="secondary-button" type="button" disabled={creating} onClick={onCancel}>Cancel</button><button type="submit" disabled={!valid || creating}>{creating ? "Creating session…" : "Create & transcribe"}</button></div>
    </form>
  </section>;
}
