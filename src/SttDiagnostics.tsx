import type { DnsmosMetrics, SttMetadata } from "./types";

const engineLabels: Record<string, string> = {
  "nemo-parakeet-multilingual": "Multilingual NeMo",
  "nemo-armenian-custom": "Armenian NeMo",
};

const decisionLabels: Record<string, string> = {
  raw_quality_acceptable: "Original audio quality was acceptable",
  sidon_selected: "Enhanced audio selected",
  sidon_rejected_after_quality_comparison: "Original audio performed better",
  sidon_not_enabled: "Audio enhancement disabled",
};

export const formatSttMetadataValue = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized) return "Not available";
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const getSttEngineLabel = (value?: string | null) =>
  value ? engineLabels[value] ?? formatSttMetadataValue(value) : "Not available";

export const getSttDecisionLabel = (value?: string | null) =>
  value ? decisionLabels[value] ?? formatSttMetadataValue(value) : "Not available";

const languageLabel = (value?: string | null) => {
  switch (value?.trim().toLowerCase()) {
    case "auto": return "Automatic / multilingual";
    case "hy": return "Armenian";
    case "ru": return "Russian";
    case "en": return "English";
    default: return formatSttMetadataValue(value);
  }
};

const booleanLabel = (value?: boolean | null) =>
  value == null ? "Not available" : value ? "Yes" : "No";

const selectedAudioLabel = (value?: string | null) => {
  switch (value?.trim().toLowerCase()) {
    case "raw": return "Original";
    case "sidon":
    case "enhanced": return "Enhanced";
    default: return formatSttMetadataValue(value);
  }
};

const metricLabel = (value?: number | null) =>
  value == null || !Number.isFinite(value) ? "Not available" : value.toFixed(2);

function DnsmosBlock({ title, metrics }: { title: string; metrics?: DnsmosMetrics | null }) {
  return (
    <article className="stt-dnsmos-card">
      <h5>{title}</h5>
      <dl>
        <div><dt>SIG</dt><dd>{metricLabel(metrics?.sig)}</dd></div>
        <div><dt>BAK</dt><dd>{metricLabel(metrics?.bak)}</dd></div>
        <div><dt>OVRL</dt><dd>{metricLabel(metrics?.ovrl)}</dd></div>
      </dl>
    </article>
  );
}

export function SttDiagnostics({ stt }: { stt?: SttMetadata | null }) {
  if (!stt) return null;

  const routing = stt.routing;
  const audioQuality = stt.audioQuality;
  const sidon = audioQuality?.sidon;
  const processingTime = sidon?.processingTimeSec;

  return (
    <details className="detail-accordion stt-diagnostics">
      <summary>
        <span>STT diagnostics</span>
        <span className="detail-accordion-plus" aria-hidden="true">+</span>
      </summary>
      <div className="detail-accordion-body stt-diagnostics-body">
        <dl className="stt-diagnostics-grid">
          <div><dt>Requested language</dt><dd>{languageLabel(routing?.requestedLanguage)}</dd></div>
          <div><dt>Selected engine</dt><dd>{getSttEngineLabel(routing?.selectedEngine)}</dd></div>
          <div><dt>Armenian fallback used</dt><dd>{booleanLabel(routing?.fallbackUsed)}</dd></div>
          <div><dt>Selected audio</dt><dd>{selectedAudioLabel(audioQuality?.selectedAudio)}</dd></div>
          <div><dt>Audio-quality decision</dt><dd>{getSttDecisionLabel(audioQuality?.decision)}</dd></div>
          <div><dt>Enhancement attempted</dt><dd>{booleanLabel(sidon?.attempted)}</dd></div>
          <div><dt>Enhancement used</dt><dd>{booleanLabel(sidon?.used)}</dd></div>
          <div><dt>Enhancement device</dt><dd>{formatSttMetadataValue(sidon?.device)}</dd></div>
          <div>
            <dt>Enhancement processing time</dt>
            <dd>{processingTime == null ? "Not available" : `${processingTime.toFixed(3)} seconds`}</dd>
          </div>
        </dl>
        <div className="stt-dnsmos-grid">
          <DnsmosBlock title="Original audio DNSMOS" metrics={audioQuality?.raw?.dnsmos} />
          <DnsmosBlock title="Enhanced audio DNSMOS" metrics={audioQuality?.enhanced?.dnsmos} />
        </div>
      </div>
    </details>
  );
}
