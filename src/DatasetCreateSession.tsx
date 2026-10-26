import { useEffect, useRef, useState, type FormEvent } from "react";
import { createAnnotationSession, type RequestError } from "./api";
import type { AppSettings, SttProvider } from "./types";
import type { CreateAnnotationSession } from "./datasetStudioTypes";
import { DatasetRecordingSelection } from "./DatasetRecordingSelection";

type Props = {
  settings: AppSettings;
  onCreated: (id: string) => void;
  onCancel: () => void;
  onUnauthorized: () => void;
  onForbidden: () => void;
  signal: AbortSignal;
};

export function DatasetCreateSession({ settings, onCreated, onCancel, onUnauthorized, onForbidden, signal: accessSignal }: Props) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<SttProvider>("gcp");
  const [model, setModel] = useState("chirp_3");
  const [language, setLanguage] = useState<CreateAnnotationSession["language"]>("auto");
  const [min, setMin] = useState("10");
  const [max, setMax] = useState("15");
  const [selected, setSelected] = useState(new Map<number, string>());
  const [selecting, setSelecting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const callbacks = useRef({ onCreated, onUnauthorized, onForbidden });
  callbacks.current = { onCreated, onUnauthorized, onForbidden };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const validDurations = Boolean(min.trim() && max.trim()) && Number.isFinite(Number(min)) && Number.isFinite(Number(max)) &&
    Number(min) >= 1 && Number(max) <= 30 && Number(min) <= Number(max);
  const valid = name.trim() && selected.size >= 1 && selected.size <= 200 && validDurations &&
    (provider !== "gcp" || model.trim()) && (provider !== "openai" || model === "whisper-1");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || creating || selecting || accessSignal.aborted) return;
    setCreating(true);
    setError("");
    try {
      const result = await createAnnotationSession(settings, {
        name: name.trim(), conversationIds: [...selected.keys()], provider,
        model: model.trim() || null, language, minClipSeconds: Number(min), maxClipSeconds: Number(max),
      }, accessSignal);
      if (mounted.current && !accessSignal.aborted) callbacks.current.onCreated(result.id);
    } catch (reason) {
      if (accessSignal.aborted) return;
      if ((reason as RequestError).status === 403) { callbacks.current.onForbidden(); return; }
      if (!mounted.current) return;
      if ((reason as RequestError).status === 401) callbacks.current.onUnauthorized();
      setError(reason instanceof Error ? reason.message : "Unable to create the session.");
    } finally { if (mounted.current) setCreating(false); }
  };

  return <section className="dataset-card" aria-label="Create annotation session">
    <div className="section-heading"><h2>Create session</h2><p>Choose recordings from any company. Sessions and exports belong to company 1. Start transcription with Create &amp; transcribe.</p></div>
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
        <DatasetRecordingSelection settings={settings} signal={accessSignal} selected={selected} onChange={setSelected}
          onBusyChange={setSelecting} onForbidden={onForbidden} onUnauthorized={onUnauthorized} />
      </fieldset>
      {error && <div className="form-message error-message" role="alert">{error}</div>}
      <div className="dataset-actions"><button className="secondary-button" type="button" disabled={creating} onClick={onCancel}>Cancel</button><button type="submit" disabled={!valid || creating || selecting}>{creating ? "Creating session…" : "Create & transcribe"}</button></div>
    </form>
  </section>;
}
