import { useEffect, useRef, useState } from "react";
import { fetchAnnotationOptions, type RequestError } from "./api";
import type { AppSettings, SttProvider } from "./types";
import type { AnnotationOptions, AnnotationTranscriptionSettings } from "./datasetStudioTypes";

const providerLabels: Record<SttProvider, string> = { gcp: "Google Cloud (GCP)", openai: "OpenAI", custom: "Custom" };
type Props = {
  settings: AppSettings;
  signal: AbortSignal;
  initialProvider?: SttProvider;
  disabled?: boolean;
  retry?: boolean;
  onChange: (value: AnnotationTranscriptionSettings | null) => void;
  onUnauthorized: () => void;
  onForbidden: () => void;
};

export function DatasetTranscriptionSettings({ settings, signal: accessSignal, initialProvider = "gcp", disabled = false, retry = false, onChange, onUnauthorized, onForbidden }: Props) {
  const [options, setOptions] = useState<AnnotationOptions | null>(null);
  const [choice, setChoice] = useState<AnnotationTranscriptionSettings>({ provider: initialProvider, model: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const currentChoice = useRef(choice);
  currentChoice.current = choice;
  const callbacks = useRef({ onChange, onUnauthorized, onForbidden });
  callbacks.current = { onChange, onUnauthorized, onForbidden };
  const defaultsLoaded = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, accessSignal]);
    setLoading(true);
    setError("");
    callbacks.current.onChange(null);
    if (!signal.aborted) void fetchAnnotationOptions(settings, signal).then((result) => {
      if (signal.aborted) return;
      const previous = currentChoice.current;
      const provider = result.providers.find((item) => item.provider === previous.provider) ?? result.providers[0];
      const canKeepModel = defaultsLoaded.current && provider.provider === previous.provider && (
        provider.models.includes(previous.model ?? "") || (provider.provider === "custom" && !provider.models.length)
      );
      const next = { provider: provider.provider, model: canKeepModel ? previous.model : provider.defaultModel ?? provider.models[0] ?? null };
      defaultsLoaded.current = true;
      currentChoice.current = next;
      setOptions(result);
      setChoice(next);
      callbacks.current.onChange(next);
    }).catch((reason: unknown) => {
      if (signal.aborted) return;
      if ((reason as RequestError).status === 403) { callbacks.current.onForbidden(); return; }
      if ((reason as RequestError).status === 401) { callbacks.current.onUnauthorized(); return; }
      setError(reason instanceof Error ? reason.message : "Unable to load transcription options.");
    }).finally(() => { if (!signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [settings.baseUrl, settings.accessToken, accessSignal, attempt]);

  const selected = options?.providers.find((item) => item.provider === choice.provider);
  const blocked = disabled || loading || Boolean(error) || !selected;
  const update = (next: AnnotationTranscriptionSettings) => {
    currentChoice.current = next;
    setChoice(next);
    callbacks.current.onChange(next);
  };

  return <div className="dataset-transcription-settings">
    {loading && <p className="dataset-muted" role="status">Loading transcription options…</p>}
    {error && <div className="form-message error-message" role="alert">{error} <button type="button" className="secondary-button small-button" disabled={disabled} onClick={() => setAttempt((value) => value + 1)}>Reload provider options</button></div>}
    <div className="dataset-form-grid">
      <label>{retry ? "Retry provider" : "STT provider"}<select disabled={blocked} value={selected ? choice.provider : ""} onChange={(event) => {
        const next = options?.providers.find((item) => item.provider === event.target.value);
        if (next) update({ provider: next.provider, model: next.defaultModel ?? next.models[0] ?? null });
      }}>
        {!selected && <option value="">{loading ? "Loading providers…" : "Provider options unavailable"}</option>}
        {options?.providers.map((provider) => <option key={provider.provider} value={provider.provider}>{providerLabels[provider.provider]}</option>)}
      </select></label>
      <label>{retry ? "Retry model" : "Model"}{selected?.provider === "custom" && !selected.models.length ?
        <input disabled={blocked} value={choice.model ?? ""} placeholder="Provider default (optional)" onChange={(event) => update({ ...choice, model: event.target.value.trim() || null })} /> :
        <select disabled={blocked} value={choice.model ?? ""} onChange={(event) => update({ ...choice, model: event.target.value || null })}>
          {!selected && <option value="">{loading ? "Loading models…" : "Model options unavailable"}</option>}
          {selected?.models.map((model) => <option data-i18n-skip key={model} value={model}>{model}{model === selected.defaultModel ? " (default)" : ""}</option>)}
        </select>}
      </label>
    </div>
  </div>;
}
