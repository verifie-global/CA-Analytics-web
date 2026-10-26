import { useState } from "react";
import type { AppSettings, SttProvider } from "./types";
import type { AnnotationTranscriptionSettings } from "./datasetStudioTypes";
import { DatasetTranscriptionSettings } from "./DatasetTranscriptionSettings";

export function DatasetRetrySettings({ settings, signal, initialProvider, failed, retrying, onRetry, onUnauthorized, onForbidden }: {
  settings: AppSettings;
  signal: AbortSignal;
  initialProvider: SttProvider;
  failed: number;
  retrying: boolean;
  onRetry: (value: AnnotationTranscriptionSettings) => Promise<void>;
  onUnauthorized: () => void;
  onForbidden: () => void;
}) {
  const [value, setValue] = useState<AnnotationTranscriptionSettings | null>(null);
  return <div className="dataset-notice dataset-warning">
    <p>{failed} recording(s) failed. Choose a provider and model to retry them.</p>
    <DatasetTranscriptionSettings settings={settings} signal={signal} initialProvider={initialProvider} disabled={retrying} retry
      onChange={setValue} onUnauthorized={onUnauthorized} onForbidden={onForbidden} />
    <button className="secondary-button" type="button" disabled={retrying || !value} onClick={() => { if (value) void onRetry(value); }}>{retrying ? "Retrying…" : "Retry failed recordings"}</button>
  </div>;
}
