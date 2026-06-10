import {
  Fragment,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  authorizeSettings,
  exportCallsCsv,
  exportQaQuestionnaire,
  fetchAudioBlob,
  fetchCallDetail,
  fetchCallFilterOptions,
  fetchCalls,
  fetchQaProfile,
  fetchQaScoringSettings,
  recalculateQaScore,
  saveQaProfile,
  saveQaScoringSettings,
  uploadCall,
} from "./api";
import satisfaiEye from "./assets/satisfai-eye.svg";
import DemoCallPage from "./DemoCallPage";
import { QaEvaluationPanel } from "./QaEvaluationPanel";
import { QaProfilePage } from "./QaProfilePage";
import { QaScoreBadge } from "./QaScoreBadge";
import type {
  AppSettings,
  CallDetail,
  CallFilterOption,
  CallFilterOptions,
  CallFilters,
  CallScoreSummary,
  CallSummary,
  QaProfile,
  QaScoringSettings,
  ScoreMetricSummary,
  SegmentEmotion,
  SpeakerSegment,
} from "./types";

const STORAGE_KEY = "ca-analytics-settings";
const HEADER_GRAPHIC_STORAGE_KEY = "ca-analytics-header-graphic";
const HEADER_GRAPHIC_COLLAPSED_STORAGE_KEY = "ca-analytics-header-graphic-collapsed";
const KEYWORD_RULES_STORAGE_KEY = "ca-analytics-keyword-rules";

type AppRoute = "dashboard" | "qa-profile" | "demo-call";
type AppNavKey =
  | "dashboard"
  | "upload"
  | "record"
  | "keyword"
  | "grid"
  | "demo"
  | "qa"
  | "logout";

type KeywordRule = {
  id: string;
  phrase: string;
  alertLabel: string;
  actionText: string;
  color: string;
  enabled: boolean;
};

type KeywordMatch = {
  rule: KeywordRule;
  count: number;
};

type HeaderMetric =
  | "total_calls"
  | "completed_calls"
  | "failed_calls"
  | "in_progress_calls"
  | "positive_calls"
  | "neutral_calls"
  | "negative_calls"
  | "avg_satisfaction"
  | "avg_friendliness";

type HeaderGraphicConfig = {
  bars: HeaderMetric[];
  summaries: HeaderMetric[];
};

const SENTIMENT_TOTAL_KEYS = ["positive", "neutral", "negative"] as const;
type SentimentTotalKey = (typeof SENTIMENT_TOTAL_KEYS)[number];
type SentimentTotals = Record<SentimentTotalKey, number | null>;

const emptySentimentTotals: SentimentTotals = {
  positive: null,
  neutral: null,
  negative: null,
};

const emptyCallFilterOptions: CallFilterOptions = {
  agents: [],
  customers: [],
};

type MultiSelectOption = {
  value: string;
  label: string;
};

type MultiSelectDropdownProps = {
  label: string;
  options: MultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
};

const uniqueTextValues = (values: Array<string | null | undefined>) => {
  const uniqueValues = new Set<string>();

  values.forEach((value) => {
    const trimmed = value?.trim();
    if (trimmed) {
      uniqueValues.add(trimmed);
    }
  });

  return [...uniqueValues].sort((first, second) =>
    first.localeCompare(second, undefined, { sensitivity: "base" }),
  );
};

const selectedFilterValues = (...values: Array<string | string[] | undefined>) =>
  uniqueTextValues(
    values.flatMap((value) => {
      if (Array.isArray(value)) {
        return value;
      }

      return value ? [value] : [];
    }),
  );

const formatPhoneFilterLabel = (option: CallFilterOption) => {
  const name = option.name?.trim();
  return name ? `${name} - ${option.phone}` : option.phone;
};

const toPhoneMultiSelectOptions = (
  options: CallFilterOption[],
  fallbackPhones: Array<string | null | undefined>,
): MultiSelectOption[] => {
  const optionsByPhone = new Map<string, MultiSelectOption>();

  options.forEach((option) => {
    const phone = option.phone.trim();
    if (phone) {
      optionsByPhone.set(phone, {
        value: phone,
        label: formatPhoneFilterLabel({ ...option, phone }),
      });
    }
  });

  uniqueTextValues(fallbackPhones).forEach((phone) => {
    if (!optionsByPhone.has(phone)) {
      optionsByPhone.set(phone, {
        value: phone,
        label: phone,
      });
    }
  });

  return [...optionsByPhone.values()].sort((first, second) =>
    first.label.localeCompare(second.label, undefined, { sensitivity: "base" }),
  );
};

const formatSummaryNumber = (value?: number | null, maximumFractionDigits = 2) => {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(value);
};

function MultiSelectDropdown({
  label,
  options,
  selectedValues,
  onChange,
}: MultiSelectDropdownProps) {
  const [searchValue, setSearchValue] = useState("");
  const selectedSet = new Set(selectedValues);
  const visibleOptions = [
    ...options,
    ...selectedValues
      .filter((value) => !options.some((option) => option.value === value))
      .map((value) => ({ value, label: value })),
  ];
  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredOptions = normalizedSearch
    ? visibleOptions.filter(
        (option) =>
          selectedSet.has(option.value) ||
          option.label.toLowerCase().includes(normalizedSearch) ||
          option.value.toLowerCase().includes(normalizedSearch),
      )
    : visibleOptions;
  const summaryText =
    selectedValues.length === 0
      ? `All ${label.toLowerCase()}`
      : selectedValues.length === 1
        ? selectedValues[0]
        : `${selectedValues.length} selected`;

  return (
    <details className="multi-select">
      <summary aria-label={label}>
        <span>{label}</span>
        <strong>{summaryText}</strong>
      </summary>
      <div className="multi-select-panel">
        <input
          type="search"
          className="multi-select-search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={`Search ${label.toLowerCase()}`}
          aria-label={`Search ${label}`}
        />
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => (
            <label key={option.value} className="multi-select-option">
              <input
                type="checkbox"
                checked={selectedSet.has(option.value)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selectedValues, option.value]
                      : selectedValues.filter((value) => value !== option.value),
                  )
                }
              />
              <span>{option.label}</span>
            </label>
          ))
        ) : (
          <div className="multi-select-empty">
            {visibleOptions.length > 0 ? "No matching values" : "No values loaded"}
          </div>
        )}
      </div>
    </details>
  );
}

const defaultSettings: AppSettings = {
  baseUrl: "https://ca.satisfai.cx",
  companyId: "",
  apiToken: "",
  accessToken: "",
  tokenType: "Bearer",
  companyName: "",
  expiresAtUtc: "",
};

const formatDateInputValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const getDefaultFilters = (): CallFilters => {
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 30);

  return {
    page: 1,
    pageSize: 10,
    search: "",
    conversationId: "",
    createdFromUtc: formatDateInputValue(fromDate),
    createdToUtc: formatDateInputValue(today),
    status: "",
    sentiment: "",
    minQaScore: "",
    maxQaScore: "",
    agentName: "",
    agentNames: [],
    agentExternalId: "",
    agentExternalIds: [],
    agentPhone: "",
    agentPhones: [],
    customerName: "",
    customerNames: [],
    customerExternalId: "",
    customerExternalIds: [],
    customerPhone: "",
    customerPhones: [],
  };
};

const getRouteFromPath = (pathName: string): AppRoute => {
  if (pathName === "/democall") {
    return "demo-call";
  }

  return pathName === "/settings/qa-profile" ? "qa-profile" : "dashboard";
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const formatTimestamp = (milliseconds?: number | null) => {
  if (milliseconds == null) return "--:--";
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const formatRecordingDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
};

const classForSentiment = (value?: string) => {
  if (!value) return "tag";
  return `tag sentiment-${value.toLowerCase()}`;
};

const csatTone = (score: number) => {
  if (score >= 8) return "csat-good";
  if (score >= 7) return "csat-medium";
  return "csat-low";
};

const formatEmotionLabel = (label: string) => {
  const readable = label.trim().replace(/[-_]+/g, " ");
  return readable
    ? readable.replace(/\b\w/g, (character) => character.toUpperCase())
    : "Unknown";
};

const formatPercentage = (score: number) =>
  `${Math.round(Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0)) * 100)}%`;

const hasDisplayEmotion = (
  emotion?: SegmentEmotion | null,
): emotion is SegmentEmotion & { label: string } =>
  Boolean(emotion?.label?.trim() && emotion.label.trim().toLowerCase() !== "unknown");

const classForEmotion = (label: string) => {
  switch (label.trim().toLowerCase()) {
    case "happy":
    case "positive":
      return "emotion-positive";
    case "angry":
    case "frustrated":
    case "stress":
      return "emotion-alert";
    case "sad":
      return "emotion-sad";
    default:
      return "emotion-neutral";
  }
};

const emotionColor = (label: string) => {
  switch (label.trim().toLowerCase()) {
    case "happy":
    case "positive":
      return "#4c96f8";
    case "angry":
    case "frustrated":
    case "stress":
      return "#ff4f68";
    case "sad":
      return "#d59bea";
    default:
      return "#d59bea";
  }
};

const emotionValence = (label: string) => {
  switch (label.trim().toLowerCase()) {
    case "happy":
    case "positive":
      return 1;
    case "angry":
    case "frustrated":
    case "stress":
      return -1;
    case "sad":
      return -0.7;
    default:
      return 0;
  }
};

const emotionSignal = (emotion: SegmentEmotion) => {
  const scores = Object.entries(emotion.scores ?? {});
  if (scores.length > 0) {
    return Math.max(
      -1,
      Math.min(
        1,
        scores.reduce((signal, [label, score]) => signal + emotionValence(label) * score, 0),
      ),
    );
  }

  return (
    emotionValence(emotion.label ?? "unknown") *
    Math.max(0, Math.min(1, emotion.confidence ?? 0))
  );
};

const buildSmoothPath = (points: Array<{ x: number; y: number }>) => {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points.slice(0, -1).reduce((path, point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[index + 1];
    const following = points[Math.min(points.length - 1, index + 2)];
    const controlStart = {
      x: point.x + (next.x - previous.x) / 6,
      y: point.y + (next.y - previous.y) / 6,
    };
    const controlEnd = {
      x: next.x - (following.x - point.x) / 6,
      y: next.y - (following.y - point.y) / 6,
    };
    return `${path} C ${controlStart.x.toFixed(1)} ${controlStart.y.toFixed(1)}, ${controlEnd.x.toFixed(1)} ${controlEnd.y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
  }, `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`);
};

const getFriendlinessLabel = (value?: number | null) => {
  if (value == null) return "N/A";
  if (value <= 3) return "Low";
  if (value <= 6) return "Medium";
  if (value <= 8) return "Good";
  return "Excellent";
};

const isInProgressStatus = (value?: string | null) => {
  const normalized = value?.toLowerCase();
  return normalized === "queued" || normalized === "processing" || normalized === "inprogress";
};

const isCompletedStatus = (value?: string | null) => value?.toLowerCase() === "completed";

const formatCallDirection = (isInbound?: boolean | null) => {
  if (isInbound == null) return "Unknown";
  return isInbound ? "Inbound" : "Outbound";
};

const getPartySummary = (party?: { name?: string | null; externalId?: string | null; phone?: string | null } | null) => {
  if (!party) {
    return {
      primary: "N/A",
      meta: [] as string[],
    };
  }

  const primary = party.name?.trim() || party.externalId?.trim() || party.phone?.trim() || "N/A";
  const meta = [
    party.name?.trim() ? `Name: ${party.name.trim()}` : "",
    party.externalId?.trim() ? `External ID: ${party.externalId.trim()}` : "",
    party.phone?.trim() ? `Phone: ${party.phone.trim()}` : "",
  ].filter(Boolean);

  return { primary, meta };
};

const renderRedactedTranscript = (value: string) =>
  value.split(/(\[REDACTED\])/g).map((part, index) =>
    part === "[REDACTED]" ? (
      <span key={`redacted-${index}`} className="redacted-token">
        {part}
      </span>
    ) : (
      part
    ),
  );

const generateConversationId = () =>
  `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const generateKeywordRuleId = () =>
  `keyword-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const defaultKeywordRule = (): KeywordRule => ({
  id: generateKeywordRuleId(),
  phrase: "",
  alertLabel: "",
  actionText: "",
  color: "#ffc83d",
  enabled: true,
});

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const defaultHeaderGraphicConfig: HeaderGraphicConfig = {
  bars: ["positive_calls", "neutral_calls", "negative_calls"],
  summaries: ["avg_satisfaction", "avg_friendliness"],
};

const headerMetricOptions: Array<{ value: HeaderMetric; label: string }> = [
  { value: "total_calls", label: "Total calls" },
  { value: "completed_calls", label: "Completed calls" },
  { value: "failed_calls", label: "Failed calls" },
  { value: "in_progress_calls", label: "In-progress calls" },
  { value: "positive_calls", label: "Positive sentiment calls" },
  { value: "neutral_calls", label: "Neutral sentiment calls" },
  { value: "negative_calls", label: "Negative sentiment calls" },
  { value: "avg_satisfaction", label: "Average satisfaction" },
  { value: "avg_friendliness", label: "Average friendliness" },
];

const headerBarClassByMetric = (metric: HeaderMetric) => {
  switch (metric) {
    case "positive_calls":
    case "completed_calls":
    case "avg_friendliness":
      return "hero-bar-positive";
    case "neutral_calls":
    case "in_progress_calls":
    case "avg_satisfaction":
      return "hero-bar-neutral";
    case "negative_calls":
    case "failed_calls":
      return "hero-bar-negative";
    default:
      return "hero-bar-default";
  }
};

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-copy">
    <path
      d="M9 9h9v11H9zM6 4h9v2H8v9H6z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BurgerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-burger">
    <path
      d="M4 7h16M4 12h16M4 17h16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-playback">
    <path d="M8 5v14l11-7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-playback">
    <path
      d="M8 5v14M16 5v14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-playback">
    <path
      d="M4 10v4h4l5 4V6l-5 4H4Zm12-1.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MutedSpeakerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-playback">
    <path
      d="M4 10v4h4l5 4V6l-5 4H4Zm12 0 5 5m0-5-5 5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MoreIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-playback">
    <path
      d="M12 5.5h.01M12 12h.01M12 18.5h.01"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

const playbackBars = Array.from({ length: 98 }, (_, index) => {
  const primaryWave = Math.sin(index * 0.38) * 17;
  const secondaryWave = Math.cos(index * 0.17) * 11;
  const accent = index % 11 === 0 ? 15 : index % 7 === 0 ? 8 : 0;
  return Math.max(20, Math.min(76, Math.round(43 + primaryWave + secondaryWave + accent)));
});

const playbackToneFromSignal = (signal: number) => {
  if (signal > 0.16) {
    return "positive";
  }

  if (signal < -0.16) {
    return "negative";
  }

  return "neutral";
};

const playbackToneAtTime = (segments: SpeakerSegment[], milliseconds: number) => {
  const activeSegment = segments.find((segment) => {
    const startMs = segment.startMs ?? 0;
    const endMs = segment.endMs ?? startMs;
    return milliseconds >= startMs && milliseconds <= endMs && hasDisplayEmotion(segment.emotion);
  });

  if (activeSegment?.emotion && hasDisplayEmotion(activeSegment.emotion)) {
    return playbackToneFromSignal(emotionSignal(activeSegment.emotion));
  }

  const nearestSegment = segments
    .filter((segment): segment is SpeakerSegment & { emotion: SegmentEmotion & { label: string } } =>
      hasDisplayEmotion(segment.emotion),
    )
    .map((segment) => {
      const startMs = segment.startMs ?? 0;
      const endMs = segment.endMs ?? startMs;
      const midpointMs = (startMs + endMs) / 2;
      return {
        segment,
        distance: Math.abs(midpointMs - milliseconds),
      };
    })
    .sort((left, right) => left.distance - right.distance)[0];

  return nearestSegment
    ? playbackToneFromSignal(emotionSignal(nearestSegment.segment.emotion))
    : "neutral";
};

const ConversationPlayback = ({
  audioUrl,
  audioRef,
  segments,
  durationSeconds,
  playbackTimeSeconds,
  isPreparing,
  onPlaybackTimeChange,
}: {
  audioUrl: string;
  audioRef: { current: HTMLAudioElement | null };
  segments: SpeakerSegment[];
  durationSeconds?: number | null;
  playbackTimeSeconds: number;
  isPreparing: boolean;
  onPlaybackTimeChange: (seconds: number) => void;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showNativeControls, setShowNativeControls] = useState(false);
  const durationMs = Math.max((durationSeconds ?? 0) * 1000, 1000);
  const progressRatio = Math.max(0, Math.min(1, playbackTimeSeconds / (durationMs / 1000)));
  const durationLabel = formatTimestamp(durationMs);
  const currentLabel = formatTimestamp(playbackTimeSeconds * 1000);
  const audioUnavailable = !audioUrl;

  useEffect(() => {
    setIsPlaying(false);
    setIsMuted(false);
    setIsOptionsOpen(false);
    setPlaybackRate(1);
    setShowNativeControls(false);
  }, [audioUrl]);

  const handleTogglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const handleToggleMute = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  };

  const handlePlaybackRate = (rate: number) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
    setPlaybackRate(rate);
  };

  const handleWaveformSeek = (event: MouseEvent<HTMLDivElement>) => {
    if (audioUnavailable) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const nextRatio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const nextSeconds = nextRatio * (durationMs / 1000);

    if (audioRef.current) {
      audioRef.current.currentTime = nextSeconds;
    }
    onPlaybackTimeChange(nextSeconds);
  };

  return (
    <section className="conversation-playback">
      <h4>Conversation Playback</h4>
      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          controls={showNativeControls}
          muted={isMuted}
          className={showNativeControls ? "audio-native-inline" : "audio-native-hidden"}
          onTimeUpdate={(event) => onPlaybackTimeChange(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => onPlaybackTimeChange(event.currentTarget.currentTime)}
          onPlay={(event) => {
            event.currentTarget.playbackRate = playbackRate;
            setIsPlaying(true);
          }}
          onPause={() => setIsPlaying(false)}
          onVolumeChange={(event) => setIsMuted(event.currentTarget.muted)}
          onRateChange={(event) => setPlaybackRate(event.currentTarget.playbackRate)}
          onEnded={() => {
            onPlaybackTimeChange(0);
            setIsPlaying(false);
          }}
        />
      ) : null}
      <div
        className={`playback-waveform ${audioUnavailable ? "playback-disabled" : ""}`}
        role="slider"
        aria-label="Conversation playback position"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(playbackTimeSeconds)}
        tabIndex={0}
        aria-disabled={audioUnavailable}
        onClick={handleWaveformSeek}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            const direction = event.key === "ArrowRight" ? 1 : -1;
            const nextSeconds = Math.max(
              0,
              Math.min(durationMs / 1000, playbackTimeSeconds + direction * 5),
            );
            if (audioRef.current) {
              audioRef.current.currentTime = nextSeconds;
            }
            onPlaybackTimeChange(nextSeconds);
          }
        }}
      >
        {playbackBars.map((height, index) => {
          const ratio = index / Math.max(1, playbackBars.length - 1);
          const barTimestampMs = ratio * durationMs;
          const tone = playbackToneAtTime(segments, barTimestampMs);
          return (
            <span
              key={`playback-bar-${index}`}
              className={`playback-bar playback-${tone}`}
              style={{ height: `${height}%` }}
            />
          );
        })}
        <span className="playback-cursor" style={{ left: `${progressRatio * 100}%` }} />
      </div>
      <div className="playback-controls">
        <span className="playback-time-badge">
          {currentLabel}-{durationLabel}
        </span>
        <button
          type="button"
          className="playback-icon-button playback-main-button"
          onClick={handleTogglePlayback}
          disabled={audioUnavailable}
          title={audioUrl ? (isPlaying ? "Pause" : "Play") : isPreparing ? "Preparing audio" : "Audio unavailable"}
          aria-label={isPlaying ? "Pause conversation" : "Play conversation"}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="playback-control-tail">
          <button
            type="button"
            className="playback-icon-button"
            aria-label={isMuted ? "Unmute playback" : "Mute playback"}
            title={isMuted ? "Unmute" : "Mute"}
            disabled={audioUnavailable}
            onClick={handleToggleMute}
          >
            {isMuted ? <MutedSpeakerIcon /> : <SpeakerIcon />}
          </button>
          <button
            type="button"
            className="playback-icon-button"
            aria-label="Playback options"
            title="Options"
            aria-expanded={isOptionsOpen}
            disabled={audioUnavailable}
            onClick={() => setIsOptionsOpen((current) => !current)}
          >
            <MoreIcon />
          </button>
          {isOptionsOpen ? (
            <div className="playback-options-menu" role="menu">
              <span>Speed</span>
              <div className="playback-rate-grid">
                {[0.75, 1, 1.25, 1.5].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={rate === playbackRate ? "is-active-rate" : ""}
                    onClick={() => handlePlaybackRate(rate)}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="playback-option-row"
                onClick={() => setShowNativeControls((current) => !current)}
              >
                {showNativeControls ? "Hide native controls" : "Show native controls"}
              </button>
              <a className="playback-option-row" href={audioUrl} download>
                Download audio
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

const DetailAccordion = ({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) => (
  <details className={`detail-accordion ${className}`}>
    <summary>
      <span>{title}</span>
      <span className="detail-accordion-plus" aria-hidden="true">
        +
      </span>
    </summary>
    <div className="detail-accordion-body">{children}</div>
  </details>
);

const EyeLogo = () => (
  <img src={satisfaiEye} alt="satisfai" className="brand-eye" />
);

const RefreshIcon = ({ spinning = false }: { spinning?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`icon-refresh ${spinning ? "icon-refresh-spin" : ""}`}
  >
    <defs>
      <linearGradient id="refresh-ring" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#a78bfa" />
        <stop offset="1" stopColor="#4090f0" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="8" fill="none" stroke="url(#refresh-ring)" strokeWidth="2.6" />
  </svg>
);

const ExternalArrowIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-extlink">
    <path
      d="M8 16 16 8M9 8h7v7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TrendArrow = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`icon-trend ${className}`}>
    <path
      d="M7 17 17 7M9 7h8v8"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const NavIcon = ({ name }: { name: AppNavKey }) => {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-icon">
      {name === "dashboard" && (
        <path d="M4 20V9M10 20V4M16 20v-7M22 20H2" {...common} />
      )}
      {name === "upload" && (
        <path d="M12 16V4m0 0 4 4m-4-4-4 4M4 18v2h16v-2" {...common} />
      )}
      {name === "record" && (
        <path
          d="M12 3a3 3 0 0 1 3 3v5a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3ZM6 11a6 6 0 0 0 12 0M12 17v4"
          {...common}
        />
      )}
      {name === "keyword" && (
        <path
          d="M14 4 4 14l6 6 10-10V4zM16.5 7.5h.01"
          {...common}
        />
      )}
      {name === "grid" && (
        <path
          d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"
          {...common}
        />
      )}
      {name === "demo" && (
        <path
          d="M4 6h16v12H4zM8 21h8M12 18v3M8.5 10.5h.01M15.5 10.5h.01M9 14c1.8 1.4 4.2 1.4 6 0"
          {...common}
        />
      )}
      {name === "qa" && (
        <path
          d="M12 3a9 9 0 1 0 9 9M12 7v5l3 2M19 4v4m2-2h-4"
          {...common}
        />
      )}
      {name === "logout" && (
        <path d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2M9 12h12m0 0-4-4m4 4-4 4" {...common} />
      )}
    </svg>
  );
};

const FriendlinessIndicator = ({ value }: { value?: number | null }) => {
  if (value == null) {
    return <span className="friendliness-value">N/A</span>;
  }

  const clampedValue = Math.max(1, Math.min(10, value));
  const label = getFriendlinessLabel(clampedValue);

  return (
    <div className="friendliness-inline">
      <span className="friendliness-value">{clampedValue}/10</span>
      <span className={`friendliness-label friendliness-${label.toLowerCase()}`}>{label}</span>
    </div>
  );
};

const SpeakerTrackGlyph = ({ kind, x, y }: { kind: string; x: number; y: number }) => {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <g className="emotion-speaker-glyph" transform={`translate(${x} ${y})`}>
      {kind === "AGENT" ? (
        <>
          <path d="M7 8a5 5 0 0 1 10 0" {...common} />
          <path d="M5 10v2a2 2 0 0 0 2 2h1v-6H7a2 2 0 0 0-2 2Zm14 0v2a2 2 0 0 1-2 2h-1V8h1a2 2 0 0 1 2 2Z" {...common} />
          <path d="M14 18h-3a4 4 0 0 1-4-4" {...common} />
        </>
      ) : (
        <>
          <path d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" {...common} />
          <path d="M5 20a7 7 0 0 1 14 0" {...common} />
        </>
      )}
    </g>
  );
};

const EmotionalTimeline = ({
  segments,
  durationSeconds,
  playbackTimeSeconds,
  onSeek,
}: {
  segments: SpeakerSegment[];
  durationSeconds?: number | null;
  playbackTimeSeconds: number;
  onSeek: (startMs?: number | null) => void;
}) => {
  const emotionalSegments = segments.filter(
    (segment): segment is SpeakerSegment & { emotion: SegmentEmotion & { label: string } } =>
      hasDisplayEmotion(segment.emotion),
  );
  if (emotionalSegments.length === 0) {
    return <p className="emotion-timeline-empty">No emotional signals available for this call.</p>;
  }

  const getTrackKey = (segment: SpeakerSegment) =>
    segment.role && segment.role !== "UNKNOWN" ? segment.role : segment.speaker;
  const trackKeys = Array.from(new Set(emotionalSegments.map(getTrackKey))).sort((left, right) => {
    const priority = (key: string) => (key === "AGENT" ? 0 : key === "CUSTOMER" ? 1 : 2);
    return priority(left) - priority(right) || left.localeCompare(right);
  });
  const totalMs = Math.max(
    (durationSeconds ?? 0) * 1000,
    ...emotionalSegments.map((segment) => segment.endMs ?? segment.startMs ?? 0),
    1000,
  );
  const chartWidth = 880;
  const chartStart = 132;
  const chartEnd = chartWidth - 14;
  const plotWidth = chartEnd - chartStart;
  const trackHeight = 112;
  const trackTop = 32;
  const svgHeight = trackTop + trackKeys.length * trackHeight + 42;
  const toX = (milliseconds: number) => chartStart + (milliseconds / totalMs) * plotWidth;
  const cursorX = toX(Math.min(totalMs, Math.max(0, playbackTimeSeconds * 1000)));
  const tickCount = Math.max(1, Math.min(6, Math.ceil(totalMs / 60000)));

  return (
    <div className="emotion-timeline">
      <div className="emotion-timeline-legend" aria-hidden="true">
        <span className="emotion-legend-positive">Positive</span>
        <span className="emotion-legend-neutral">Neutral</span>
        <span className="emotion-legend-alert">Negative</span>
      </div>
      <svg
        viewBox={`0 0 ${chartWidth} ${svgHeight}`}
        role="img"
        aria-label="Emotional signals timeline separated by speaker"
      >
        {trackKeys.map((key, trackIndex) => {
          const baseline = trackTop + 46 + trackIndex * trackHeight;
          const speakerSegments = emotionalSegments
            .filter((segment) => getTrackKey(segment) === key)
            .sort((left, right) => (left.startMs ?? 0) - (right.startMs ?? 0));
          const dataPoints = speakerSegments.map((segment) => ({
            segment,
            x: toX(((segment.startMs ?? 0) + (segment.endMs ?? segment.startMs ?? 0)) / 2),
            y: baseline - emotionSignal(segment.emotion) * 25,
          }));
          const curvePoints = dataPoints.map(({ x, y }) => ({ x, y }));
          const gradientId = `emotion-flow-${key.replace(/[^a-z0-9_-]/gi, "-")}-${trackIndex}`;
          return (
            <g key={key}>
              <defs>
                <linearGradient id={gradientId} x1="0%" x2="100%">
                  {dataPoints.length === 0 ? (
                    <stop stopColor={emotionColor("neutral")} />
                  ) : (
                    dataPoints.map(({ segment, x }, index) => (
                      <stop
                        key={`${segment.emotion.label}-${index}`}
                        offset={`${((x - chartStart) / plotWidth) * 100}%`}
                        stopColor={emotionColor(segment.emotion.label)}
                      />
                    ))
                  )}
                </linearGradient>
              </defs>
              <SpeakerTrackGlyph kind={key} x={12} y={baseline - 42} />
              {[
                ["Positive", baseline - 25],
                ["Neutral", baseline],
                ["Negative", baseline + 25],
              ].map(([label, y]) => (
                <g key={`${key}-${label}`}>
                  <text className="emotion-scale-label" x={50} y={Number(y) + 4}>
                    {label}
                  </text>
                  <line
                    className="emotion-track-baseline"
                    x1={chartStart}
                    x2={chartEnd}
                    y1={Number(y)}
                    y2={Number(y)}
                  />
                </g>
              ))}
              {curvePoints.length > 1 ? (
                <>
                  <path
                    className="emotion-flow-shadow"
                    d={buildSmoothPath(curvePoints)}
                  />
                  <path
                    className="emotion-flow-line"
                    d={buildSmoothPath(curvePoints)}
                    stroke={`url(#${gradientId})`}
                  />
                </>
              ) : null}
              {dataPoints.map(({ segment, x, y }, index) => {
                const confidence =
                  typeof segment.emotion.confidence === "number"
                    ? ` ${formatPercentage(segment.emotion.confidence)}`
                    : "";
                const speakerLabel = key === "AGENT" ? "Agent" : key === "CUSTOMER" ? "Customer" : formatEmotionLabel(key);
                const description = `${speakerLabel}: ${formatEmotionLabel(segment.emotion.label)}${confidence} (${formatTimestamp(segment.startMs)} - ${formatTimestamp(segment.endMs)})`;
                return (
                  <rect
                    key={`${segment.startMs ?? 0}-${index}`}
                    className="emotion-flow-point"
                    x={x - 5}
                    y={y - 5}
                    width={10}
                    height={10}
                    rx={1.5}
                    fill={emotionColor(segment.emotion.label)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${description}. Seek to segment.`}
                    onClick={() => onSeek(segment.startMs)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSeek(segment.startMs);
                      }
                    }}
                  >
                    <title>{description}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
        {Array.from({ length: tickCount + 1 }, (_, index) => {
          const tickMs = Math.min(totalMs, index * 60000);
          const x = toX(tickMs);
          return (
            <g key={`tick-${index}`}>
              <line
                className="emotion-timeline-grid"
                x1={x}
                x2={x}
                y1={trackTop - 12}
                y2={trackTop + trackKeys.length * trackHeight - 14}
              />
              <text className="emotion-timeline-tick" x={x} y={svgHeight - 6}>
                {formatTimestamp(tickMs)}
              </text>
            </g>
          );
        })}
        <line
          className="emotion-timeline-cursor"
          x1={cursorX}
          x2={cursorX}
          y1={trackTop - 12}
          y2={trackTop + trackKeys.length * trackHeight - 14}
        />
        <circle className="emotion-timeline-cursor-dot" cx={cursorX} cy={trackTop - 12} r={4} />
        <circle className="emotion-timeline-cursor-dot" cx={cursorX} cy={trackTop + trackKeys.length * trackHeight - 14} r={4} />
      </svg>
    </div>
  );
};

async function validateAudioFileSampleRate(file: File) {
  void file;
  return null;

  /*
  const fileName = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();

  if (!fileName.endsWith(".wav") && mimeType !== "audio/wav" && mimeType !== "audio/x-wav") {
    throw new Error(
      "Only WAV files are supported for client-side sample rate validation. Please upload a WAV file with at least 16000 Hz.",
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const sampleRate = readWavSampleRate(bytes);

  if (sampleRate < 16000) {
    throw new Error(
      `Audio sample rate is ${sampleRate} Hz. Please upload a file with at least 16000 Hz.`,
    );
  }

  return sampleRate;
  */
}

function App() {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() =>
    getRouteFromPath(window.location.pathname),
  );
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultSettings;

    try {
      const parsed = JSON.parse(saved) as Partial<AppSettings> & { token?: string };
      return {
        ...defaultSettings,
        ...parsed,
        apiToken: parsed.apiToken ?? parsed.token ?? "",
        accessToken: parsed.accessToken ?? "",
      };
    } catch {
      return defaultSettings;
    }
  });
  const [draftSettings, setDraftSettings] = useState<AppSettings>(settings);
  const [filters, setFilters] = useState<CallFilters>(() => getDefaultFilters());
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [callsTotal, setCallsTotal] = useState<number | null>(null);
  const [callScoreSummary, setCallScoreSummary] = useState<CallScoreSummary | null>(null);
  const [sentimentTotals, setSentimentTotals] = useState<SentimentTotals>(emptySentimentTotals);
  const [callFilterOptions, setCallFilterOptions] = useState<CallFilterOptions>(
    emptyCallFilterOptions,
  );
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedConversationIds, setSelectedConversationIds] = useState<string[]>([]);
  const [detailPortalTarget, setDetailPortalTarget] = useState<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<CallDetail | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [audioRequestedFor, setAudioRequestedFor] = useState<string>("");
  const [audioPendingFor, setAudioPendingFor] = useState<string>("");
  const [playbackTimeSeconds, setPlaybackTimeSeconds] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>(
    "Enter your company ID and API token to get started.",
  );
  const [callsLoading, setCallsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isRecordingModalOpen, setIsRecordingModalOpen] = useState(false);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string>("");
  const [isHeaderEditorOpen, setIsHeaderEditorOpen] = useState(false);
  const [isKeywordManagerOpen, setIsKeywordManagerOpen] = useState(false);
  const [isQaExportModalOpen, setIsQaExportModalOpen] = useState(false);
  const [isHeaderGraphicCollapsed, setIsHeaderGraphicCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem(HEADER_GRAPHIC_COLLAPSED_STORAGE_KEY);
    return saved == null ? true : saved === "true";
  });
  const [headerGraphicConfig, setHeaderGraphicConfig] = useState<HeaderGraphicConfig>(() => {
    const saved = localStorage.getItem(HEADER_GRAPHIC_STORAGE_KEY);
    if (!saved) {
      return defaultHeaderGraphicConfig;
    }

    try {
      return { ...defaultHeaderGraphicConfig, ...(JSON.parse(saved) as Partial<HeaderGraphicConfig>) };
    } catch {
      return defaultHeaderGraphicConfig;
    }
  });
  const [keywordRules, setKeywordRules] = useState<KeywordRule[]>(() => {
    const saved = localStorage.getItem(KEYWORD_RULES_STORAGE_KEY);
    if (!saved) {
      return [];
    }

    try {
      const parsed = JSON.parse(saved) as KeywordRule[];
      return Array.isArray(parsed)
        ? parsed.map((rule) => ({
            ...rule,
            color: rule.color || "#ffc83d",
          }))
        : [];
    } catch {
      return [];
    }
  });
  const [transcriptCache, setTranscriptCache] = useState<Record<string, string>>({});
  const [uploadValidationMessage, setUploadValidationMessage] = useState<string>("");
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [qaExportSubmitting, setQaExportSubmitting] = useState(false);
  const [csvExportSubmitting, setCsvExportSubmitting] = useState(false);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "recorded">("idle");
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0);
  const [recordingErrorMessage, setRecordingErrorMessage] = useState("");
  const [recordedAudioUrl, setRecordedAudioUrl] = useState("");
  const [recordedAudioFile, setRecordedAudioFile] = useState<File | null>(null);
  const [recordingUploading, setRecordingUploading] = useState(false);
  const [qaProfile, setQaProfile] = useState<QaProfile | null>(null);
  const [qaProfileLoading, setQaProfileLoading] = useState(false);
  const [qaProfileSaving, setQaProfileSaving] = useState(false);
  const [qaProfileError, setQaProfileError] = useState("");
  const [qaProfileSuccess, setQaProfileSuccess] = useState("");
  const [qaScoringSettings, setQaScoringSettings] = useState<QaScoringSettings | null>(null);
  const [qaScoringSettingsLoading, setQaScoringSettingsLoading] = useState(false);
  const [qaScoringSettingsSaving, setQaScoringSettingsSaving] = useState(false);
  const [qaScoringSettingsError, setQaScoringSettingsError] = useState("");
  const [qaScoringSettingsSuccess, setQaScoringSettingsSuccess] = useState("");
  const [qaRecalculating, setQaRecalculating] = useState(false);
  const [qaRecalculateError, setQaRecalculateError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const diarizationContainerRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);
  const [uploadState, setUploadState] = useState({
    conversationId: generateConversationId(),
    url: "",
    files: [] as File[],
  });

  const isUnauthorizedError = (error: unknown) =>
    Boolean(
      error &&
        typeof error === "object" &&
        "status" in error &&
        (error as { status?: number }).status === 401,
    );

  const navigateTo = (route: AppRoute) => {
    const nextPath =
      route === "qa-profile" ? "/settings/qa-profile" : route === "demo-call" ? "/democall" : "/";
    window.history.pushState({}, "", nextPath);
    setCurrentRoute(route);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setDraftSettings(settings);
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(HEADER_GRAPHIC_STORAGE_KEY, JSON.stringify(headerGraphicConfig));
  }, [headerGraphicConfig]);

  useEffect(() => {
    localStorage.setItem(
      HEADER_GRAPHIC_COLLAPSED_STORAGE_KEY,
      String(isHeaderGraphicCollapsed),
    );
  }, [isHeaderGraphicCollapsed]);

  useEffect(() => {
    localStorage.setItem(KEYWORD_RULES_STORAGE_KEY, JSON.stringify(keywordRules));
  }, [keywordRules]);

  useEffect(() => {
    document.documentElement.dataset.theme = "light";
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(getRouteFromPath(window.location.pathname));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(
    () => () => {
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
      }
    },
    [recordedAudioUrl],
  );

  useEffect(() => {
    if (recordingState !== "recording") {
      return;
    }

    const timer = window.setInterval(() => {
      if (recordingStartedAtRef.current != null) {
        setRecordingDurationSeconds(
          Math.max(0, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)),
        );
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    setDetailPortalTarget(null);
  }, [selectedId]);

  useEffect(() => {
    setTranscriptCache({});
  }, [settings.companyId]);

  useEffect(() => {
    if (!isAuthorized || keywordRules.length === 0 || calls.length === 0) {
      return;
    }

    const missingIds = calls
      .map((call) => call.conversationId)
      .filter((conversationId) => transcriptCache[conversationId] == null);

    if (missingIds.length === 0) {
      return;
    }

    let cancelled = false;

    const hydrateTranscriptCache = async () => {
      for (const conversationId of missingIds) {
        if (cancelled) {
          return;
        }

        try {
          const nextDetail = await fetchCallDetail(settings, conversationId);
          if (!cancelled) {
            setTranscriptCache((current) => ({
              ...current,
              [conversationId]: nextDetail.transcript?.trim() ?? "",
            }));
          }
        } catch (error) {
          if (!cancelled && isUnauthorizedError(error)) {
            handleUnauthorizedSession();
            return;
          }

          if (!cancelled) {
            setTranscriptCache((current) => ({
              ...current,
              [conversationId]: "",
            }));
          }
        }
      }
    };

    void hydrateTranscriptCache();

    return () => {
      cancelled = true;
    };
  }, [calls, isAuthorized, keywordRules, settings, transcriptCache]);

  useEffect(() => {
    if (!settings.companyId || !settings.apiToken) {
      setIsAuthorized(false);
      return;
    }

    if (settings.accessToken) {
      setIsAuthorized(true);
      return;
    }

    let cancelled = false;

    const checkAuthorization = async () => {
      setAuthChecking(true);

      try {
        const authorizedSettings = await authorizeSettings(settings);
        if (!cancelled) {
          setSettings(authorizedSettings);
          setIsAuthorized(true);
          setStatusMessage(
            authorizedSettings.companyName
              ? `Authorization successful for ${authorizedSettings.companyName}.`
              : "Authorization successful.",
          );
        }
      } catch {
        if (!cancelled) {
          setIsAuthorized(false);
        }
      } finally {
        if (!cancelled) {
          setAuthChecking(false);
        }
      }
    };

    void checkAuthorization();

    return () => {
      cancelled = true;
    };
  }, [settings]);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    void refreshCalls(settings, { silent: true });
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) {
      setCallFilterOptions(emptyCallFilterOptions);
      return;
    }

    let cancelled = false;

    const loadCallFilterOptions = async () => {
      try {
        const nextOptions = await fetchCallFilterOptions(settings);
        if (!cancelled) {
          setCallFilterOptions(nextOptions);
        }
      } catch (error) {
        if (!cancelled && isUnauthorizedError(error)) {
          handleUnauthorizedSession();
          return;
        }

        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load call filter options.",
          );
        }
      }
    };

    void loadCallFilterOptions();

    return () => {
      cancelled = true;
    };
  }, [isAuthorized, settings]);

  useEffect(() => {
    if (!isAuthorized || currentRoute !== "qa-profile") {
      return;
    }

    let cancelled = false;

    const loadQaSettings = async () => {
      setQaProfileLoading(true);
      setQaScoringSettingsLoading(true);
      setQaProfileError("");
      setQaProfileSuccess("");
      setQaScoringSettingsError("");
      setQaScoringSettingsSuccess("");

      try {
        const [profileResult, scoringSettingsResult] = await Promise.allSettled([
          fetchQaProfile(settings),
          fetchQaScoringSettings(settings),
        ]);

        if (!cancelled) {
          const unauthorizedResult = [profileResult, scoringSettingsResult].find(
            (result) => result.status === "rejected" && isUnauthorizedError(result.reason),
          );

          if (unauthorizedResult) {
            handleUnauthorizedSession();
            return;
          }

          if (profileResult.status === "fulfilled") {
            setQaProfile(profileResult.value);
          } else {
            setQaProfileError(
              profileResult.reason instanceof Error
                ? profileResult.reason.message
                : "Unable to load QA profile.",
            );
          }

          if (scoringSettingsResult.status === "fulfilled") {
            setQaScoringSettings(scoringSettingsResult.value);
          } else {
            setQaScoringSettingsError(
              scoringSettingsResult.reason instanceof Error
                ? scoringSettingsResult.reason.message
                : "Unable to load QA scoring settings.",
            );
          }
        }
      } finally {
        if (!cancelled) {
          setQaProfileLoading(false);
          setQaScoringSettingsLoading(false);
        }
      }
    };

    void loadQaSettings();

    return () => {
      cancelled = true;
    };
  }, [currentRoute, isAuthorized, settings]);

  useEffect(
    () => () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    },
    [audioUrl],
  );

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    const hasInProgressConversation = calls.some((call) => isInProgressStatus(call.status));
    const selectedNeedsRefresh = isInProgressStatus(detail?.status);

    if (!hasInProgressConversation && !selectedNeedsRefresh) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshCalls(settings, { silent: true });
      if (selectedId) {
        void handleLoadDetail(selectedId, { silent: true });
      }
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isAuthorized, calls, detail?.status, selectedId, settings, filters]);

  useEffect(() => {
    if (
      !selectedId ||
      !detail ||
      detail.status !== "Completed" ||
      audioUrl ||
      audioLoading ||
      audioRequestedFor === selectedId
    ) {
      return;
    }

    setAudioRequestedFor(selectedId);
    void handleAudioLoad(selectedId);
  }, [selectedId, detail, audioUrl, audioLoading, audioRequestedFor]);

  const canQueryApi = useMemo(
    () => Boolean(settings.baseUrl && settings.companyId && settings.accessToken),
    [settings],
  );

  const updateCallFilters = (patch: Partial<CallFilters>) => {
    setFilters((current) => ({
      ...current,
      ...patch,
      page: 1,
    }));
  };

  const updateMultiFilter = (
    pluralKey:
      | "agentNames"
      | "agentExternalIds"
      | "agentPhones"
      | "customerNames"
      | "customerExternalIds"
      | "customerPhones",
    legacyKey:
      | "agentName"
      | "agentExternalId"
      | "agentPhone"
      | "customerName"
      | "customerExternalId"
      | "customerPhone",
    values: string[],
  ) => {
    setFilters((current) => ({
      ...current,
      [pluralKey]: uniqueTextValues(values),
      [legacyKey]: "",
      page: 1,
    }));
  };

  const refreshCalls = async (
    activeSettings: AppSettings = settings,
    options?: { silent?: boolean; filtersOverride?: CallFilters },
  ) => {
    if (!activeSettings.baseUrl || !activeSettings.companyId || !activeSettings.accessToken) {
      setErrorMessage("Authorize with a company ID and API token before loading calls.");
      return;
    }

    if (!options?.silent) {
      setCallsLoading(true);
      setErrorMessage("");
    }

    try {
      const activeFilters = options?.filtersOverride ?? filters;
      const result = await fetchCalls(activeSettings, activeFilters);
      const nextCalls = result.items;
      setCalls(nextCalls);
      setCallsTotal(result.total);
      setCallScoreSummary(result.scoreSummary ?? null);

      const sentimentTotalEntries = await Promise.allSettled(
        SENTIMENT_TOTAL_KEYS.map(async (sentiment) => {
          const sentimentResult = await fetchCalls(activeSettings, {
            ...activeFilters,
            page: 1,
            pageSize: 1,
            sentiment,
          });
          return [sentiment, sentimentResult.total] as const;
        }),
      );
      const nextSentimentTotals = { ...emptySentimentTotals };

      sentimentTotalEntries.forEach((entry) => {
        if (entry.status === "fulfilled") {
          const [sentiment, total] = entry.value;
          nextSentimentTotals[sentiment] = total;
        } else if (isUnauthorizedError(entry.reason)) {
          throw entry.reason;
        }
      });
      setSentimentTotals(nextSentimentTotals);

      setSelectedConversationIds((current) =>
        current.filter((conversationId) =>
          nextCalls.some(
            (call) => call.conversationId === conversationId && isCompletedStatus(call.status),
          ),
        ),
      );
      if (!options?.silent) {
        setStatusMessage(
          result.total > nextCalls.length
            ? `Loaded ${nextCalls.length} of ${result.total} calls.`
            : `Loaded ${nextCalls.length} call${nextCalls.length === 1 ? "" : "s"}.`,
        );
      }

      if (selectedId && !nextCalls.some((call) => call.conversationId === selectedId)) {
        setSelectedId("");
        setDetail(null);
      }
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleUnauthorizedSession();
        return;
      }

      if (!options?.silent) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load calls.");
      }
    } finally {
      if (!options?.silent) {
        setCallsLoading(false);
      }
    }
  };

  const handleSettingsSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    setAuthChecking(true);
    setStatusMessage("Checking authorization...");

    try {
      const authorizedSettings = await authorizeSettings({
        ...draftSettings,
        accessToken: "",
      });
      setSettings(authorizedSettings);
      setIsAuthorized(true);
      setStatusMessage(
        authorizedSettings.companyName
          ? `Authorization successful for ${authorizedSettings.companyName}. Loading dashboard...`
          : "Authorization successful. Loading dashboard...",
      );
      setTimeout(() => {
        void refreshCalls(authorizedSettings);
      }, 0);
    } catch (error) {
      setIsAuthorized(false);
      setErrorMessage(error instanceof Error ? error.message : "Authorization failed.");
    } finally {
      setAuthChecking(false);
    }
  };

  const handleLoadDetail = async (conversationId: string, options?: { silent?: boolean }) => {
    setSelectedId(conversationId);
    if (!options?.silent) {
      setDetailLoading(true);
      setErrorMessage("");
    }

    if (!options?.silent && audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl("");
    }
    if (!options?.silent) {
      setPlaybackTimeSeconds(0);
    }
    if (!options?.silent) {
      setAudioRequestedFor("");
      setAudioPendingFor("");
    }

    try {
      const nextDetail = await fetchCallDetail(settings, conversationId);
      setDetail(nextDetail);
      setTranscriptCache((current) => ({
        ...current,
        [conversationId]: nextDetail.transcript?.trim() ?? "",
      }));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleUnauthorizedSession();
        return;
      }

      if (!options?.silent) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load call details.");
        setDetail(null);
      }
    } finally {
      if (!options?.silent) {
        setDetailLoading(false);
      }
    }
  };

  const handleCloseDetail = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    setSelectedId("");
    setDetail(null);
    setDetailPortalTarget(null);
    setAudioUrl("");
    setAudioRequestedFor("");
    setAudioPendingFor("");
    setPlaybackTimeSeconds(0);
  };

  const handleRowClick = (conversationId: string) => {
    if (selectedId === conversationId) {
      handleCloseDetail();
      return;
    }

    void handleLoadDetail(conversationId);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, conversationId: string) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleRowClick(conversationId);
  };

  const handlePageChange = (nextPage: number) => {
    const nextFilters = {
      ...filters,
      page: Math.max(1, nextPage),
    };

    setFilters(nextFilters);
    void refreshCalls(settings, { filtersOverride: nextFilters });
  };

  const handleSaveQaProfile = async (profile: QaProfile) => {
    setQaProfileSaving(true);
    setQaProfileError("");
    setQaProfileSuccess("");

    try {
      const savedProfile = await saveQaProfile(settings, profile);
      setQaProfile(savedProfile);
      setQaProfileSuccess("QA profile saved successfully.");
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleUnauthorizedSession();
        return;
      }

      setQaProfileError(error instanceof Error ? error.message : "Unable to save QA profile.");
    } finally {
      setQaProfileSaving(false);
    }
  };

  const handleSaveQaScoringSettings = async (minScorableCallDurationSeconds: number | null) => {
    setQaScoringSettingsSaving(true);
    setQaScoringSettingsError("");
    setQaScoringSettingsSuccess("");

    try {
      const savedSettings = await saveQaScoringSettings(
        settings,
        minScorableCallDurationSeconds,
      );
      setQaScoringSettings(savedSettings);
      setQaScoringSettingsSuccess("QA scoring settings saved successfully.");
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleUnauthorizedSession();
        return;
      }

      setQaScoringSettingsError(
        error instanceof Error ? error.message : "Unable to save QA scoring settings.",
      );
    } finally {
      setQaScoringSettingsSaving(false);
    }
  };

  const handleRecalculateQa = async () => {
    if (!detail?.conversationId) {
      return;
    }

    setQaRecalculating(true);
    setQaRecalculateError("");

    try {
      const recalculatedQa = await recalculateQaScore(settings, detail.conversationId);
      const refreshedDetail = await fetchCallDetail(settings, detail.conversationId);
      const nextDetail = refreshedDetail.qa
        ? refreshedDetail
        : {
            ...refreshedDetail,
            qa: recalculatedQa,
          };
      const nextQa = nextDetail.qa;

      setDetail(nextDetail);
      setTranscriptCache((current) => ({
        ...current,
        [detail.conversationId]: nextDetail.transcript?.trim() ?? "",
      }));
      setCalls((current) =>
        current.map((call) =>
          call.conversationId === detail.conversationId
            ? {
                ...call,
                qaScore: nextQa ? nextQa.score ?? null : call.qaScore,
                qaIsApplicable: nextQa ? nextQa.isApplicable ?? null : call.qaIsApplicable,
                qaStatus: nextQa ? nextQa.status ?? null : call.qaStatus,
                qaNotApplicableReason: nextQa
                  ? nextQa.notApplicableReason ?? null
                  : call.qaNotApplicableReason,
                qaEarnedPoints: nextQa ? nextQa.earnedPoints ?? null : call.qaEarnedPoints,
                qaPossiblePoints: nextQa ? nextQa.possiblePoints ?? null : call.qaPossiblePoints,
              }
            : call,
        ),
      );
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleUnauthorizedSession();
        return;
      }

      setQaRecalculateError(
        error instanceof Error ? error.message : "Unable to recalculate QA score.",
      );
    } finally {
      setQaRecalculating(false);
    }
  };

  const openUploadModal = () => {
    setUploadState({
      conversationId: generateConversationId(),
      url: "",
      files: [],
    });
    setUploadValidationMessage("");
    setUploadErrorMessage("");
    setIsUploadModalOpen(true);
  };

  const closeRecordingModal = () => {
    discardRecordingRef.current = true;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    recordingStartedAtRef.current = null;

    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }

    setRecordedAudioUrl("");
    setRecordedAudioFile(null);
    setRecordingDurationSeconds(0);
    setRecordingErrorMessage("");
    setRecordingState("idle");
    setRecordingUploading(false);
    setIsRecordingModalOpen(false);
  };

  const openRecordingModal = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Audio recording is not supported in this browser.");
      return;
    }

    try {
      discardRecordingRef.current = false;

      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mimeType });
        const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `recording-${Date.now()}.${extension}`, { type: mimeType });

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        recordingStartedAtRef.current = null;

        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          return;
        }

        setRecordedAudioFile(file);
        setRecordedAudioUrl(URL.createObjectURL(blob));
        setRecordingState("recorded");
      };

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setRecordingDurationSeconds(0);
      setRecordingErrorMessage("");
      setRecordedAudioUrl("");
      setRecordedAudioFile(null);
      setRecordingState("recording");
      setIsRecordingModalOpen(true);
      recorder.start();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start audio recording.");
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      return;
    }

    mediaRecorderRef.current.stop();
  };

  const handleRecordingUpload = async () => {
    if (!recordedAudioFile) {
      setRecordingErrorMessage("Record audio first before uploading.");
      return;
    }

    setRecordingUploading(true);
    setRecordingErrorMessage("");

    try {
      const conversationId = generateConversationId();
      await uploadCall(settings, {
        conversationId,
        url: "",
        file: recordedAudioFile,
      });

      setStatusMessage(`Upload accepted. ${conversationId} is now queued for analysis.`);
      closeRecordingModal();
      await refreshCalls();
      await handleLoadDetail(conversationId);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleUnauthorizedSession();
        return;
      }

      setRecordingErrorMessage(
        error instanceof Error ? error.message : "Unable to upload the recorded audio.",
      );
    } finally {
      setRecordingUploading(false);
    }
  };

  const handleAudioLoad = async (conversationId: string) => {
    if (!conversationId) return;

    setAudioLoading(true);
    setAudioPendingFor(conversationId);

    try {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      const blob = await fetchAudioBlob(settings, conversationId);
      setAudioUrl(URL.createObjectURL(blob));
      setAudioPendingFor("");
      setPlaybackTimeSeconds(0);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleUnauthorizedSession();
        return;
      }

      const maybeStatus = error as Error & { status?: number };
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      const isNotReadyYet =
        maybeStatus.status === 404 ||
        message.includes("not found") ||
        message.includes("404");

      if (!isNotReadyYet) {
        setAudioPendingFor("");
        setErrorMessage(error instanceof Error ? error.message : "Unable to load audio.");
      }
    } finally {
      setAudioLoading(false);
    }
  };

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();

    if (!uploadState.conversationId || (!uploadState.url && uploadState.files.length === 0)) {
      setUploadErrorMessage("Provide either a presigned URL or one or more local audio files.");
      return;
    }

    if (uploadState.url && uploadState.files.length > 0) {
      setUploadErrorMessage("Use either a presigned URL or local audio files in a single upload.");
      return;
    }

    setErrorMessage("");
    setUploadValidationMessage("");
    setUploadErrorMessage("");
    setUploadSubmitting(true);
    setStatusMessage("Uploading call and queuing analysis...");

    try {
      const uploadedConversationIds: string[] = [];

      if (uploadState.files.length > 0) {
        for (const [index, file] of uploadState.files.entries()) {
          const conversationId = generateConversationId();
          setStatusMessage(
            `Uploading ${index + 1} of ${uploadState.files.length}: ${file.name}`,
          );

          const sampleRate = await validateAudioFileSampleRate(file);
          if (sampleRate != null) {
            setUploadValidationMessage(`Validated local audio at ${sampleRate} Hz.`);
          }

          await uploadCall(settings, {
            conversationId,
            url: "",
            file,
          });

          uploadedConversationIds.push(conversationId);
        }
      } else {
        await uploadCall(settings, {
          conversationId: uploadState.conversationId,
          url: uploadState.url,
          file: null,
        });
        uploadedConversationIds.push(uploadState.conversationId);
      }

      setStatusMessage(
        uploadedConversationIds.length === 1
          ? `Upload accepted. ${uploadedConversationIds[0]} is now queued for analysis.`
          : `Upload accepted. ${uploadedConversationIds.length} calls are now queued for analysis.`,
      );
      setIsUploadModalOpen(false);
      setUploadState({ conversationId: generateConversationId(), url: "", files: [] });
      setUploadValidationMessage("");
      setUploadErrorMessage("");
      await refreshCalls();
      await handleLoadDetail(uploadedConversationIds[uploadedConversationIds.length - 1]);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleUnauthorizedSession();
        return;
      }

      setUploadErrorMessage(error instanceof Error ? error.message : "Unable to upload the call.");
    } finally {
      setUploadSubmitting(false);
    }
  };

  const handleCopy = async (label: string, value?: string | null) => {
    if (!value?.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedSection(label);
      window.setTimeout(() => {
        setCopiedSection((current) => (current === label ? "" : current));
      }, 1800);
    } catch {
      setErrorMessage("Unable to copy text to clipboard.");
    }
  };

  const handleSeekToSegment = (startMs?: number | null) => {
    if (!audioRef.current || startMs == null) {
      return;
    }

    const nextTime = startMs / 1000;
    audioRef.current.currentTime = nextTime;
    setPlaybackTimeSeconds(nextTime);
    void audioRef.current.play().catch(() => undefined);
  };

  const handleLogout = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());

    localStorage.removeItem(STORAGE_KEY);
    setSettings(defaultSettings);
    setDraftSettings(defaultSettings);
    setCalls([]);
    setCallsTotal(null);
    setCallScoreSummary(null);
    setSentimentTotals(emptySentimentTotals);
    setCallFilterOptions(emptyCallFilterOptions);
    setSelectedId("");
    setSelectedConversationIds([]);
    setDetail(null);
    setAudioUrl("");
    setAudioRequestedFor("");
    setAudioPendingFor("");
    setIsAuthorized(false);
    setIsUploadModalOpen(false);
    setIsRecordingModalOpen(false);
    setUploadSubmitting(false);
    setUploadValidationMessage("");
    setUploadErrorMessage("");
    setErrorMessage("");
    setQaExportSubmitting(false);
    setCsvExportSubmitting(false);
    setQaProfile(null);
    setQaProfileLoading(false);
    setQaProfileSaving(false);
    setQaProfileError("");
    setQaProfileSuccess("");
    setQaRecalculating(false);
    setQaRecalculateError("");
    setTranscriptCache({});
    setCurrentRoute("dashboard");
    setStatusMessage("You have been logged out.");
    setUploadState({
      conversationId: generateConversationId(),
      url: "",
      files: [],
    });
  };

  const handleUnauthorizedSession = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());

    localStorage.removeItem(STORAGE_KEY);
    setSettings(defaultSettings);
    setDraftSettings(defaultSettings);
    setCalls([]);
    setCallsTotal(null);
    setCallScoreSummary(null);
    setSentimentTotals(emptySentimentTotals);
    setCallFilterOptions(emptyCallFilterOptions);
    setSelectedId("");
    setSelectedConversationIds([]);
    setDetail(null);
    setAudioUrl("");
    setAudioRequestedFor("");
    setAudioPendingFor("");
    setIsAuthorized(false);
    setIsUploadModalOpen(false);
    setIsRecordingModalOpen(false);
    setIsKeywordManagerOpen(false);
    setIsHeaderEditorOpen(false);
    setIsQaExportModalOpen(false);
    setUploadSubmitting(false);
    setQaExportSubmitting(false);
    setCsvExportSubmitting(false);
    setQaProfile(null);
    setQaProfileLoading(false);
    setQaProfileSaving(false);
    setQaProfileError("");
    setQaProfileSuccess("");
    setQaRecalculating(false);
    setQaRecalculateError("");
    setUploadValidationMessage("");
    setUploadErrorMessage("");
    setTranscriptCache({});
    setCurrentRoute("dashboard");
    setErrorMessage("Your session expired. Please sign in again.");
    setStatusMessage("Authorization required.");
    setUploadState({
      conversationId: generateConversationId(),
      url: "",
      files: [],
    });
  };

  const addKeywordRule = () => {
    setKeywordRules((current) => [...current, defaultKeywordRule()]);
  };

  const updateKeywordRule = (
    ruleId: string,
    field: "phrase" | "alertLabel" | "actionText" | "color" | "enabled",
    value: string | boolean,
  ) => {
    setKeywordRules((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, [field]: value } : rule)),
    );
  };

  const removeKeywordRule = (ruleId: string) => {
    setKeywordRules((current) => current.filter((rule) => rule.id !== ruleId));
  };

  const toggleConversationSelection = (conversationId: string) => {
    setSelectedConversationIds((current) =>
      current.includes(conversationId)
        ? current.filter((id) => id !== conversationId)
        : [...current, conversationId],
    );
  };

  const openQaExportModal = () => {
    setSelectedConversationIds((current) =>
      current.filter((conversationId) =>
        exportableCalls.some((call) => call.conversationId === conversationId),
      ),
    );
    setIsQaExportModalOpen(true);
  };

  const downloadBlobFile = (blob: Blob, fileName: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const handleQaExport = async () => {
    if (selectedConversationIds.length === 0) {
      setErrorMessage("Select at least one completed conversation to export the QA questionnaire.");
      return;
    }

    setQaExportSubmitting(true);
    setErrorMessage("");

    try {
      let exportedCount = 0;

      for (const [index, conversationId] of selectedConversationIds.entries()) {
        setStatusMessage(
          `Exporting QA questionnaire ${index + 1} of ${selectedConversationIds.length}: ${conversationId}`,
        );
        const result = await exportQaQuestionnaire(settings, conversationId);
        downloadBlobFile(result.blob, result.fileName);
        exportedCount += 1;
      }

      setStatusMessage(
        `Downloaded ${exportedCount} QA monitoring questionnaire${exportedCount === 1 ? "" : "s"}.`,
      );
      setIsQaExportModalOpen(false);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleUnauthorizedSession();
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Unable to export QA monitoring questionnaire.",
      );
    } finally {
      setQaExportSubmitting(false);
    }
  };

  const handleCallsCsvExport = async () => {
    setCsvExportSubmitting(true);
    setErrorMessage("");

    try {
      setStatusMessage("Exporting calls CSV with current filters...");
      const result = await exportCallsCsv(settings, filters);
      downloadBlobFile(result.blob, result.fileName);
      setStatusMessage(`Downloaded ${result.fileName}.`);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleUnauthorizedSession();
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Unable to export calls CSV.");
    } finally {
      setCsvExportSubmitting(false);
    }
  };

  const transcript = detail?.transcript?.trim();
  const redactedTranscript = detail?.redactedTranscript?.trim();
  const summary = detail?.summary?.trim();
  const keywordMatches: KeywordMatch[] = useMemo(() => {
    if (!transcript) {
      return [];
    }

    return keywordRules
      .filter((rule) => rule.enabled && rule.phrase.trim())
      .map((rule) => {
        const matches = transcript.match(new RegExp(escapeRegExp(rule.phrase.trim()), "gi"));
        return {
          rule,
          count: matches?.length ?? 0,
        };
      })
      .filter((match) => match.count > 0);
  }, [keywordRules, transcript]);
  const exportableCalls = useMemo(
    () => calls.filter((call) => isCompletedStatus(call.status)),
    [calls],
  );
  const allExportableSelected =
    exportableCalls.length > 0 &&
    exportableCalls.every((call) => selectedConversationIds.includes(call.conversationId));
  const agentPhoneValues = selectedFilterValues(filters.agentPhones, filters.agentPhone);
  const customerPhoneValues = selectedFilterValues(filters.customerPhones, filters.customerPhone);
  const agentPhoneOptions = useMemo(
    () =>
      toPhoneMultiSelectOptions(
        callFilterOptions.agents,
        calls.map((call) => call.agentInfo?.phone),
      ),
    [callFilterOptions.agents, calls],
  );
  const customerPhoneOptions = useMemo(
    () =>
      toPhoneMultiSelectOptions(
        callFilterOptions.customers,
        calls.map((call) => call.customerInfo?.phone),
      ),
    [callFilterOptions.customers, calls],
  );
  const scoreSummaryMetrics: Array<{
    label: string;
    summary?: ScoreMetricSummary | null;
  }> = [
    {
      label: "Customer Satisfaction",
      summary: callScoreSummary?.customerSatisfactionScore,
    },
    {
      label: "Agent Friendliness",
      summary: callScoreSummary?.agentFriendlinessScore,
    },
    {
      label: "QA Score",
      summary: callScoreSummary?.qaScore,
    },
  ];
  const canLoadNextCallsPage =
    callsTotal == null ? calls.length >= filters.pageSize : filters.page * filters.pageSize < callsTotal;
  const pagerSummary =
    callsTotal == null
      ? `${calls.length} shown`
      : `${calls.length} shown of ${callsTotal}`;
  const positiveCount = calls.filter((call) => call.sentiment?.toLowerCase() === "positive").length;
  const neutralCount = calls.filter((call) => call.sentiment?.toLowerCase() === "neutral").length;
  const negativeCount = calls.filter((call) => call.sentiment?.toLowerCase() === "negative").length;
  const positiveSentimentCount = sentimentTotals.positive ?? positiveCount;
  const neutralSentimentCount = sentimentTotals.neutral ?? neutralCount;
  const negativeSentimentCount = sentimentTotals.negative ?? negativeCount;
  const avgScore = (() => {
    const scoredCalls = calls.filter((call) => typeof call.satisfactionScore === "number");
    if (scoredCalls.length === 0) {
      return null;
    }

    const total = scoredCalls.reduce((sum, call) => sum + (call.satisfactionScore ?? 0), 0);
    return (total / scoredCalls.length).toFixed(1);
  })();
  const avgFriendliness = (() => {
    const scoredCalls = calls.filter((call) => typeof call.friendlinessScore === "number");
    if (scoredCalls.length === 0) {
      return null;
    }

    const total = scoredCalls.reduce((sum, call) => sum + (call.friendlinessScore ?? 0), 0);
    return (total / scoredCalls.length).toFixed(1);
  })();
  const averageSatisfactionScore =
    callScoreSummary?.customerSatisfactionScore?.average ??
    (avgScore ? Number(avgScore) : null);
  const averageFriendlinessScore =
    callScoreSummary?.agentFriendlinessScore?.average ??
    (avgFriendliness ? Number(avgFriendliness) : null);
  const completedCount = calls.filter((call) => call.status?.toLowerCase() === "completed").length;
  const failedCount = calls.filter((call) => call.status?.toLowerCase() === "failed").length;
  const inProgressCount = calls.filter((call) => isInProgressStatus(call.status)).length;
  const totalCallCount = callsTotal ?? callScoreSummary?.callCount ?? calls.length;
  const metricValues: Record<
    HeaderMetric,
    { value: number | null; max: number; formatted: string; description: string }
  > = {
    total_calls: {
      value: totalCallCount,
      max: Math.max(totalCallCount, 1),
      formatted: String(totalCallCount),
      description: "Total calls matching the current filters",
    },
    completed_calls: {
      value: completedCount,
      max: Math.max(calls.length, 1),
      formatted: String(completedCount),
      description: "Calls with completed analysis",
    },
    failed_calls: {
      value: failedCount,
      max: Math.max(calls.length, 1),
      formatted: String(failedCount),
      description: "Calls that finished with an error",
    },
    in_progress_calls: {
      value: inProgressCount,
      max: Math.max(calls.length, 1),
      formatted: String(inProgressCount),
      description: "Calls still queued or processing",
    },
    positive_calls: {
      value: positiveSentimentCount,
      max: Math.max(totalCallCount, positiveSentimentCount, 1),
      formatted: String(positiveSentimentCount),
      description: "Calls matching the current filters with positive sentiment",
    },
    neutral_calls: {
      value: neutralSentimentCount,
      max: Math.max(totalCallCount, neutralSentimentCount, 1),
      formatted: String(neutralSentimentCount),
      description: "Calls matching the current filters with neutral sentiment",
    },
    negative_calls: {
      value: negativeSentimentCount,
      max: Math.max(totalCallCount, negativeSentimentCount, 1),
      formatted: String(negativeSentimentCount),
      description: "Calls matching the current filters with negative sentiment",
    },
    avg_satisfaction: {
      value: averageSatisfactionScore,
      max: 10,
      formatted:
        averageSatisfactionScore == null
          ? "N/A"
          : `${formatSummaryNumber(averageSatisfactionScore, 1)}/10`,
      description: "Average satisfaction score across filtered calls",
    },
    avg_friendliness: {
      value: averageFriendlinessScore,
      max: 10,
      formatted:
        averageFriendlinessScore == null
          ? "N/A"
          : `${formatSummaryNumber(averageFriendlinessScore, 1)}/10`,
      description: "Average friendliness score across filtered calls",
    },
  };
  const activeSegmentIndex = detail?.segments.findIndex((segment) => {
    const start = (segment.startMs ?? 0) / 1000;
    const end = (segment.endMs ?? Number.MAX_SAFE_INTEGER) / 1000;
    return playbackTimeSeconds >= start && playbackTimeSeconds <= end;
  }) ?? -1;
  const entityEntries = Object.entries(detail?.entities ?? {}).filter(([, value]) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );
  const topics = Array.isArray(detail?.analysis?.topics)
    ? (detail?.analysis?.topics as string[])
    : [];
  const mainTopicRaw =
    typeof detail?.analysis?.mainTopic === "string"
      ? detail.analysis.mainTopic
      : typeof detail?.analysis?.manTopic === "string"
        ? detail.analysis.manTopic
        : "";
  const mainTopic = mainTopicRaw.trim();
  const secondaryTopics = mainTopic
    ? topics.filter((topic) => topic.trim().toLowerCase() !== mainTopic.toLowerCase())
    : topics;
  const customerConcerns = Array.isArray(detail?.analysis?.customerConcerns)
    ? (detail?.analysis?.customerConcerns as Array<Record<string, unknown>>)
    : [];
  const coachingAssistance = Array.isArray(detail?.analysis?.coachingAssistance)
    ? (detail?.analysis?.coachingAssistance as string[])
    : [];
  const relatedDepartment =
    typeof detail?.analysis?.department === "string" ? detail.analysis.department : null;
  const taskUrgency =
    typeof detail?.analysis?.taskUrgency === "string" ? detail.analysis.taskUrgency : null;
  const agentSummary = getPartySummary(detail?.agentInfo);
  const customerSummary = getPartySummary(detail?.customerInfo);
  const callDirection = formatCallDirection(detail?.isInbound);

  const addHeaderBar = () => {
    setHeaderGraphicConfig((current) => ({
      ...current,
      bars: [...current.bars, "total_calls"],
    }));
  };

  const removeHeaderBar = (index: number) => {
    setHeaderGraphicConfig((current) => ({
      ...current,
      bars: current.bars.length > 1 ? current.bars.filter((_, currentIndex) => currentIndex !== index) : current.bars,
    }));
  };

  const addHeaderSummary = () => {
    setHeaderGraphicConfig((current) => ({
      ...current,
      summaries: [...current.summaries, "avg_satisfaction"],
    }));
  };

  const removeHeaderSummary = (index: number) => {
    setHeaderGraphicConfig((current) => ({
      ...current,
      summaries:
        current.summaries.length > 1
          ? current.summaries.filter((_, currentIndex) => currentIndex !== index)
          : current.summaries,
    }));
  };

  useEffect(() => {
    if (activeSegmentIndex < 0 || !diarizationContainerRef.current) {
      return;
    }

    const activeElement = diarizationContainerRef.current.querySelector<HTMLElement>(
      `[data-segment-index="${activeSegmentIndex}"]`,
    );

    if (!activeElement) {
      return;
    }

    activeElement.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [activeSegmentIndex]);

  if (currentRoute === "demo-call") {
    return <DemoCallPage />;
  }

  if (!isAuthorized) {
    return (
      <div className="app-shell auth-shell">
        <section className="auth-card">
          <div className="auth-brand">
            <EyeLogo />
          </div>
          <p className="eyebrow">Authorization</p>
          <h1>Call Analytics Dashboard</h1>
          <p className="hero-copy">
            Enter your company ID and partner API token. We will exchange it for a backend JWT
            before loading the dashboard.
          </p>

          <form className="grid-form" onSubmit={handleSettingsSubmit}>
            <label>
              Base URL
              <input
                value={draftSettings.baseUrl}
                onChange={(event) =>
                  setDraftSettings((current) => ({ ...current, baseUrl: event.target.value }))
                }
                placeholder="https://ca.satisfai.cx"
              />
            </label>

            <label>
              Company ID
              <input
                value={draftSettings.companyId}
                onChange={(event) =>
                  setDraftSettings((current) => ({ ...current, companyId: event.target.value }))
                }
              />
            </label>

            <label className="full-width">
              API token
              <input
                type="password"
                value={draftSettings.apiToken}
                onChange={(event) =>
                  setDraftSettings((current) => ({ ...current, apiToken: event.target.value }))
                }
              />
            </label>

            <button className="full-width" type="submit" disabled={authChecking}>
              {authChecking ? "Checking..." : "Authorize"}
            </button>
          </form>

          <div className="status-strip">
            <span>{statusMessage}</span>
            {errorMessage ? <strong>{errorMessage}</strong> : null}
          </div>
        </section>
      </div>
    );
  }

  const companyInitials = (settings.companyName || "Workspace")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  const navItems: Array<{
    key: AppNavKey;
    label: string;
    active: boolean;
    onClick: () => void;
  }> = [
    {
      key: "dashboard",
      label: "Dashboard",
      active: currentRoute === "dashboard" && !isHeaderGraphicCollapsed,
      onClick: () => {
        navigateTo("dashboard");
        setIsHeaderGraphicCollapsed(false);
      },
    },
    { key: "upload", label: "Upload call", active: false, onClick: openUploadModal },
    {
      key: "record",
      label: "Record call",
      active: false,
      onClick: () => void openRecordingModal(),
    },
    {
      key: "demo",
      label: "Demo call",
      active: false,
      onClick: () => navigateTo("demo-call"),
    },
    {
      key: "keyword",
      label: "Keyword rules",
      active: false,
      onClick: () => setIsKeywordManagerOpen(true),
    },
    {
      key: "grid",
      label: "Grid",
      active: currentRoute === "dashboard" && isHeaderGraphicCollapsed,
      onClick: () => {
        navigateTo("dashboard");
        setIsHeaderGraphicCollapsed(true);
      },
    },
    {
      key: "qa",
      label: "QA settings",
      active: currentRoute === "qa-profile",
      onClick: () => navigateTo("qa-profile"),
    },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <EyeLogo />
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-item ${item.active ? "nav-item-active" : ""}`}
              onClick={item.onClick}
            >
              <NavIcon name={item.key} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button type="button" className="nav-item" onClick={handleLogout}>
            <NavIcon name="logout" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <div className="topbar">
          <div className="topbar-search">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="topbar-search-icon">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={filters.search}
              onChange={(event) => updateCallFilters({ search: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const nextFilters = { ...filters, search: filters.search, page: 1 };
                  setFilters(nextFilters);
                  void refreshCalls(settings, { filtersOverride: nextFilters });
                }
              }}
              placeholder="Search"
              aria-label="Search calls"
            />
          </div>
          <div className="topbar-user">
            <div className="topbar-user-text">
              <strong>{settings.companyName || "Workspace"}</strong>
              <span>{settings.companyId || settings.baseUrl}</span>
            </div>
            <div className="topbar-avatar" aria-hidden="true">
              {companyInitials || "CA"}
            </div>
          </div>
        </div>

        {currentRoute === "dashboard" ? (
          <header className="dashboard-head">
            <div className="dashboard-head-title">
              <span className="dashboard-head-icon">
                <NavIcon name="dashboard" />
              </span>
              <div>
                <h1>Call Analytics Dashboard</h1>
                <p className="hero-copy">
                  Upload audio, monitor processing, and inspect transcripts, diarization,
                  sentiment, and satisfaction scores from your backend.
                </p>
              </div>
            </div>
            <div className="dashboard-head-actions">
              <button
                type="button"
                className="secondary-button small-button button-with-icon"
                onClick={() => setIsHeaderEditorOpen(true)}
              >
                <BurgerIcon />
                <span>Filter</span>
              </button>
            </div>
          </header>
        ) : null}

        {currentRoute === "dashboard" && !isHeaderGraphicCollapsed ? (
          <section className="hero-graphic" aria-label="Sentiment overview">
            <div className="hero-bars">
              {headerGraphicConfig.bars.map((metric) => {
                const metricData = metricValues[metric];
                const optionLabel =
                  headerMetricOptions.find((option) => option.value === metric)?.label ?? metric;
                const heightPercent =
                  metricData.value == null || metricData.max <= 0
                    ? 24
                    : 24 + (metricData.value / metricData.max) * 76;

                return (
                  <div key={metric} className="hero-bar-col">
                    <label className="hero-bar-label">{optionLabel}</label>
                    <div
                      className={`hero-bar-group ${headerBarClassByMetric(metric)}`}
                      style={{ height: `${heightPercent}%` }}
                    >
                      <strong>{metricData.formatted}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hero-strip">
              <button
                type="button"
                className="secondary-button small-button button-with-icon hero-collapse"
                onClick={() => setIsHeaderGraphicCollapsed(true)}
              >
                <BurgerIcon />
                <span>Collapse</span>
              </button>
              {headerGraphicConfig.summaries.map((metric) => {
                const metricData = metricValues[metric];
                const optionLabel =
                  headerMetricOptions.find((option) => option.value === metric)?.label ?? metric;
                const outOfTen = metric === "avg_satisfaction" || metric === "avg_friendliness";
                const arrowTone =
                  metric === "avg_satisfaction"
                    ? "trend-blue"
                    : metric === "avg_friendliness"
                      ? "trend-purple"
                      : "trend-muted";

                return (
                  <div key={metric} className="hero-strip-stat">
                    <div className="hero-strip-label">
                      <span>{optionLabel}</span>
                      {outOfTen ? <small>overall</small> : null}
                    </div>
                    <div className="hero-strip-value">
                      <strong>{outOfTen ? metricData.formatted.split("/")[0] : metricData.formatted}</strong>
                      <TrendArrow className={arrowTone} />
                      {outOfTen ? <small>10</small> : null}
                    </div>
                  </div>
                );
              })}
              <div className="hero-strip-stat hero-strip-visible">
                <div className="hero-strip-label">
                  <span>Visible calls</span>
                </div>
                <div className="hero-strip-value">
                  <strong>{calls.length}</strong>
                </div>
              </div>
            </div>
          </section>
        ) : null}

      <main className="layout">
        {currentRoute === "qa-profile" ? (
          <QaProfilePage
            profile={qaProfile}
            qaScoringSettings={qaScoringSettings}
            loading={qaProfileLoading}
            saving={qaProfileSaving}
            qaScoringSettingsLoading={qaScoringSettingsLoading}
            qaScoringSettingsSaving={qaScoringSettingsSaving}
            errorMessage={qaProfileError}
            successMessage={qaProfileSuccess}
            qaScoringSettingsErrorMessage={qaScoringSettingsError}
            qaScoringSettingsSuccessMessage={qaScoringSettingsSuccess}
            onSave={handleSaveQaProfile}
            onSaveQaScoringSettings={handleSaveQaScoringSettings}
          />
        ) : (
          <section className="panel">
            <div className="section-heading">
              <h2>Call explorer</h2>
              <p>Filter your company calls, then open one to inspect the full analysis.</p>
            </div>

            <div className="explorer-actions">
              <button
                type="button"
                className="export-button button-with-icon"
                onClick={() => void handleCallsCsvExport()}
                disabled={csvExportSubmitting || callsLoading}
              >
                <span>{csvExportSubmitting ? "Exporting CSV..." : "Export calls CSV"}</span>
                <ExternalArrowIcon />
              </button>
              <button
                type="button"
                className="export-button button-with-icon"
                onClick={openQaExportModal}
                disabled={exportableCalls.length === 0}
              >
                <span>Export QA monitoring questionnaire</span>
                <ExternalArrowIcon />
              </button>
            </div>

            <form
              className="filters"
              onSubmit={(event) => {
                event.preventDefault();
                const nextFilters = { ...filters, page: 1 };
                setFilters(nextFilters);
                void refreshCalls(settings, { filtersOverride: nextFilters });
              }}
            >
            <input
              value={filters.search}
              onChange={(event) => updateCallFilters({ search: event.target.value })}
              placeholder="Search transcript or metadata"
            />
            <input
              value={filters.conversationId}
              onChange={(event) =>
                updateCallFilters({ conversationId: event.target.value })
              }
              placeholder="Conversation ID"
            />
            <input
              type="date"
              value={filters.createdFromUtc}
              onChange={(event) =>
                updateCallFilters({ createdFromUtc: event.target.value })
              }
              aria-label="Created from date"
              title="Created from"
            />
            <input
              type="date"
              value={filters.createdToUtc}
              onChange={(event) =>
                updateCallFilters({ createdToUtc: event.target.value })
              }
              aria-label="Created to date"
              title="Created to"
            />
            <select
              value={filters.status}
              onChange={(event) => updateCallFilters({ status: event.target.value })}
            >
              <option value="">All statuses</option>
              <option value="Queued">Queued</option>
              <option value="Processing">Processing</option>
              <option value="Completed">Completed</option>
              <option value="Failed">Failed</option>
            </select>
            <select
              value={filters.sentiment}
              onChange={(event) =>
                updateCallFilters({ sentiment: event.target.value })
              }
            >
              <option value="">All sentiment</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
            <input
              type="number"
              min="0"
              max="100"
              value={filters.minQaScore}
              onChange={(event) => updateCallFilters({ minQaScore: event.target.value })}
              placeholder="Min QA score"
            />
            <input
              type="number"
              min="0"
              max="100"
              value={filters.maxQaScore}
              onChange={(event) => updateCallFilters({ maxQaScore: event.target.value })}
              placeholder="Max QA score"
            />
            <MultiSelectDropdown
              label="Agent phones"
              options={agentPhoneOptions}
              selectedValues={agentPhoneValues}
              onChange={(values) => updateMultiFilter("agentPhones", "agentPhone", values)}
            />
            <MultiSelectDropdown
              label="Customer phones"
              options={customerPhoneOptions}
              selectedValues={customerPhoneValues}
              onChange={(values) => updateMultiFilter("customerPhones", "customerPhone", values)}
            />
            <button
              type="submit"
              className="refresh-button button-with-icon"
              disabled={!canQueryApi || callsLoading}
            >
              <span>{callsLoading ? "Loading..." : "Refresh"}</span>
              <RefreshIcon spinning={callsLoading} />
            </button>
            </form>

            <div className="score-summary-grid" aria-label="Score summary">
              {scoreSummaryMetrics.map((metric) => (
                <article key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{formatSummaryNumber(metric.summary?.average)}</strong>
                  <small>Cumulative {formatSummaryNumber(metric.summary?.cumulative)}</small>
                  {metric.summary?.missingCount != null ? (
                    <small>Missing {formatSummaryNumber(metric.summary.missingCount, 0)}</small>
                  ) : null}
                  {metric.summary?.notApplicableCount != null ? (
                    <small>
                      Not applicable {formatSummaryNumber(metric.summary.notApplicableCount, 0)}
                    </small>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="workspace">
              <div className="list-column">
                {calls.length === 0 ? (
                  <div className="empty-state">
                    <h3>No calls loaded yet</h3>
                    <p>Save your connection settings, then load or upload a call.</p>
                  </div>
                ) : (
                  <div className="calls-grid" role="table" aria-label="Conversations">
                    <div className="calls-grid-header" role="row">
                      <span>Conversation</span>
                      <span>Agent</span>
                      <span>Status</span>
                      <span>Sentiment</span>
                      <span>CSAT Score</span>
                      <span>QA Score</span>
                      <span>Language</span>
                      <span>Datetime</span>
                    </div>

                    {calls.map((call) => {
                      return (
                        <Fragment key={call.conversationId}>
                          <div
                            className={`call-row ${call.sentiment ? `row-${call.sentiment.toLowerCase()}` : ""} ${selectedId === call.conversationId ? "selected" : ""}`}
                            onClick={() => handleRowClick(call.conversationId)}
                            onKeyDown={(event) => handleRowKeyDown(event, call.conversationId)}
                            role="row"
                            tabIndex={0}
                          >
                            <span
                              className="call-row-primary"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <span className="call-row-id">{call.conversationId}</span>
                            </span>
                            <span className="call-row-agent">
                              {getPartySummary(call.agentInfo).primary}
                            </span>
                            <span className={`tag ${isInProgressStatus(call.status) ? "tag-progress" : ""}`}>
                              {isInProgressStatus(call.status) ? (
                                <span className="status-inline">
                                  <span className="status-pulse" />
                                  {call.status}
                                </span>
                              ) : (
                                call.status
                              )}
                            </span>
                            <span className={classForSentiment(call.sentiment)}>
                              {call.sentiment ?? "unknown"}
                            </span>
                            <span>
                              {call.satisfactionScore == null ? (
                                <span className="muted-cell">-</span>
                              ) : (
                                <span className={`csat-pill ${csatTone(call.satisfactionScore)}`}>
                                  {call.satisfactionScore}
                                </span>
                              )}
                            </span>
                            <QaScoreBadge
                              score={call.qaScore}
                              isApplicable={call.qaIsApplicable}
                              status={call.qaStatus}
                              notApplicableReason={call.qaNotApplicableReason}
                              earnedPoints={call.qaEarnedPoints}
                              possiblePoints={call.qaPossiblePoints}
                              compact
                            />
                            <span className="call-row-language">{call.language ?? "No language"}</span>
                            <span>{formatDate(call.createdUtc)}</span>
                            {call.error ? <span className="error-text call-row-error">{call.error}</span> : null}
                          </div>
                          {selectedId === call.conversationId ? (
                            <div
                              className="inline-detail-target"
                              ref={(node) => {
                                if (node && detailPortalTarget !== node) {
                                  setDetailPortalTarget(node);
                                }
                              }}
                            />
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid-pager">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handlePageChange(filters.page - 1)}
                  disabled={callsLoading || filters.page <= 1}
                >
                  Previous
                </button>
                <span>
                  Page {filters.page} - {pagerSummary} - {filters.pageSize} per page
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handlePageChange(filters.page + 1)}
                  disabled={callsLoading || !canLoadNextCallsPage}
                >
                  Next
                </button>
              </div>

              {detailPortalTarget
                ? createPortal(
                    <div className="detail-column inline-detail">
              {!selectedId ? (
                <div className="empty-state">
                  <h3>Select a call</h3>
                  <p>The call detail view will appear here.</p>
                </div>
              ) : detailLoading ? (
                <div className="empty-state">
                  <h3>Loading analysis</h3>
                  <p>Fetching transcript, diarization, and scoring data.</p>
                </div>
              ) : detail ? (
                <>
                  <ConversationPlayback
                    audioUrl={audioUrl}
                    audioRef={audioRef}
                    segments={detail.segments}
                    durationSeconds={detail.durationSeconds}
                    playbackTimeSeconds={playbackTimeSeconds}
                    isPreparing={audioLoading || audioPendingFor === detail.conversationId}
                    onPlaybackTimeChange={setPlaybackTimeSeconds}
                  />

                  <div className="detail-panels figma-detail-panels">
                    <section className="detail-section emotion-timeline-section">
                      <h4>Emotional Timeline</h4>
                      <div className="scroll-panel emotion-timeline-panel">
                        <EmotionalTimeline
                          segments={detail.segments}
                          durationSeconds={detail.durationSeconds}
                          playbackTimeSeconds={playbackTimeSeconds}
                          onSeek={handleSeekToSegment}
                        />
                      </div>
                    </section>

                    <div className="detail-lower-grid">
                      <section className="detail-section diarization-section">
                        <h4>Diarization</h4>
                        <div ref={diarizationContainerRef} className="scroll-panel chat-panel figma-chat-panel">
                          {detail.segments.length === 0 ? (
                            <p>No speaker segments available.</p>
                          ) : (
                            detail.segments.map((segment, index) => {
                              const confidence =
                                typeof segment.emotion?.confidence === "number"
                                  ? formatPercentage(segment.emotion.confidence)
                                  : "";
                              const emotionClass = hasDisplayEmotion(segment.emotion)
                                ? classForEmotion(segment.emotion.label)
                                : "emotion-neutral";
                              const roleLabel =
                                segment.role === "AGENT"
                                  ? "Agent"
                                  : segment.role === "CUSTOMER"
                                    ? "Customer"
                                    : segment.speaker;

                              return (
                                <article
                                  data-segment-index={index}
                                  key={`${segment.speaker}-${index}`}
                                  className={`segment-card detail-segment-card role-${(segment.role ?? "UNKNOWN").toLowerCase()} ${activeSegmentIndex === index ? "segment-active" : ""}`}
                                  onClick={() => handleSeekToSegment(segment.startMs)}
                                >
                                  <div className="detail-segment-head">
                                    <strong>{roleLabel}</strong>
                                    {confidence ? (
                                      <span className={`emotion-confidence ${emotionClass}`}>
                                        {confidence}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p>{segment.text}</p>
                                  <span className="detail-segment-time">
                                    {formatTimestamp(segment.startMs)}-{formatTimestamp(segment.endMs)}
                                  </span>
                                </article>
                              );
                            })
                          )}
                        </div>
                      </section>

                      <div className="detail-right-stack">
                        <section className="detail-section keyword-alerts-section">
                          <h4>Keyword Alerts</h4>
                          <div className="scroll-panel keyword-panel figma-keyword-panel">
                            {keywordMatches.length > 0 ? (
                              keywordMatches.map((match) => (
                                <article key={match.rule.id} className="keyword-alert-row">
                                  <div className="keyword-alert-labels" aria-hidden="true">
                                    <span>Alert label:</span>
                                    <span>Keyword:</span>
                                    <span>Action:</span>
                                  </div>
                                  <div
                                    className="keyword-alert-card"
                                    style={{
                                      backgroundColor: `${match.rule.color}33`,
                                    }}
                                  >
                                    <strong>{match.rule.alertLabel || match.rule.phrase}</strong>
                                    <p>{match.rule.phrase}</p>
                                    <p>{match.rule.actionText || "No action set."}</p>
                                  </div>
                                </article>
                              ))
                            ) : keywordRules.length > 0 ? (
                              <p>No configured keywords were found in this transcript.</p>
                            ) : (
                              <p>No keyword rules yet. Add them from the dashboard to trigger transcript alerts.</p>
                            )}
                          </div>
                        </section>

                        <section className="detail-section">
                          <h4>Customer Concerns</h4>
                          <div className="scroll-panel concern-panel figma-concern-panel">
                            {customerConcerns.length > 0 ? (
                              customerConcerns.map((concern, index) => {
                                const resolved = Boolean(concern.resolved);
                                const actionsTaken = Array.isArray(concern.actionsTaken)
                                  ? (concern.actionsTaken as string[])
                                  : [];
                                const solution =
                                  actionsTaken.length > 0
                                    ? actionsTaken.join(" ")
                                    : String(concern.solution ?? concern.resolution ?? "No solution recorded.");

                                return (
                                  <article key={`concern-${index}`} className="concern-card figma-concern-card">
                                    <span className={`bool-badge ${resolved ? "bool-true" : "bool-false"}`}>
                                      {resolved ? "Resolved" : "Not resolved"}
                                    </span>
                                    <dl>
                                      <div>
                                        <dt>Topic:</dt>
                                        <dd>{String(concern.concern ?? `Concern ${index + 1}`)}</dd>
                                      </div>
                                      {concern.customerQuestion ? (
                                        <div>
                                          <dt>Question:</dt>
                                          <dd>{String(concern.customerQuestion)}</dd>
                                        </div>
                                      ) : null}
                                      <div>
                                        <dt>Solution:</dt>
                                        <dd>{solution}</dd>
                                      </div>
                                    </dl>
                                  </article>
                                );
                              })
                            ) : (
                              <p>No customer concerns available.</p>
                            )}
                          </div>
                        </section>

                        <section className="detail-section">
                          <h4>Coaching Assistance</h4>
                          <div className="scroll-panel coaching-panel figma-coaching-panel">
                            {coachingAssistance.length > 0 ? (
                              coachingAssistance.map((item, index) => (
                                <article key={`coaching-${index}`} className="coaching-card figma-coaching-card">
                                  <span>[{index + 1}]</span>
                                  <p>{item}</p>
                                </article>
                              ))
                            ) : (
                              <p>No coaching assistance available.</p>
                            )}
                          </div>
                        </section>

                        <DetailAccordion title="Original Transcription">
                          <div className="scroll-panel prose-block copy-panel detail-transcript-panel">
                            <button
                              type="button"
                              className={`icon-button ${copiedSection === "transcript" ? "is-copied" : ""}`}
                              onClick={() => void handleCopy("transcript", transcript)}
                              disabled={!transcript}
                              aria-label="Copy original transcription"
                              title={copiedSection === "transcript" ? "Copied" : "Copy"}
                            >
                              <CopyIcon />
                            </button>
                            {transcript ? transcript : "No original transcription available yet."}
                          </div>
                        </DetailAccordion>

                        <DetailAccordion title="Redacted Transcription">
                          <div className="scroll-panel prose-block redacted-panel detail-transcript-panel">
                            {redactedTranscript
                              ? renderRedactedTranscript(redactedTranscript)
                              : "No redacted transcription available yet."}
                          </div>
                        </DetailAccordion>

                        <DetailAccordion title="Raw Analysis">
                          <div className="raw-analysis-grid">
                            <article className="routing-card">
                              <label>Status</label>
                              <strong className={isInProgressStatus(detail.status) ? "status-animated-text" : ""}>
                                {detail.status}
                              </strong>
                            </article>
                            <article className="routing-card">
                              <label>Direction</label>
                              <strong>{callDirection}</strong>
                            </article>
                            <article className="routing-card">
                              <label>Sentiment</label>
                              <strong>{detail.sentiment ?? "-"}</strong>
                            </article>
                            <article className="routing-card">
                              <label>Satisfaction</label>
                              <strong>{detail.satisfactionScore ?? "-"}</strong>
                            </article>
                            <article className="routing-card">
                              <label>Friendliness</label>
                              <strong><FriendlinessIndicator value={detail.friendlinessScore} /></strong>
                            </article>
                            <article className="routing-card">
                              <label>Department</label>
                              <strong>{relatedDepartment ?? "N/A"}</strong>
                            </article>
                            <article className="routing-card">
                              <label>Task urgency</label>
                              <strong className={`urgency-badge ${taskUrgency ? `urgency-${taskUrgency.toLowerCase()}` : ""}`}>
                                {taskUrgency ?? "N/A"}
                              </strong>
                            </article>
                            <article className="routing-card">
                              <label>Agent</label>
                              <strong>{agentSummary.primary}</strong>
                              {agentSummary.meta.map((item) => (
                                <span key={item} className="routing-meta">{item}</span>
                              ))}
                            </article>
                            <article className="routing-card">
                              <label>Customer</label>
                              <strong>{customerSummary.primary}</strong>
                              {customerSummary.meta.map((item) => (
                                <span key={item} className="routing-meta">{item}</span>
                              ))}
                            </article>
                            {summary ? (
                              <article className="routing-card raw-analysis-wide">
                                <label>Summary</label>
                                <p>{summary}</p>
                              </article>
                            ) : null}
                            {mainTopic || secondaryTopics.length > 0 ? (
                              <article className="routing-card raw-analysis-wide">
                                <label>Topics</label>
                                <div className="token-panel">
                                  {mainTopic ? (
                                    <span className="main-topic-badge">
                                      <span className="main-topic-label">Main topic</span>
                                      <strong>{mainTopic}</strong>
                                    </span>
                                  ) : null}
                                  {secondaryTopics.map((topic, index) => (
                                    <span key={`${topic}-${index}`} className="token-chip">
                                      {topic}
                                    </span>
                                  ))}
                                </div>
                              </article>
                            ) : null}
                            {entityEntries.length > 0 ? (
                              <article className="routing-card raw-analysis-wide">
                                <label>Entities</label>
                                <div className="entity-panel">
                                  {entityEntries.map(([key, value]) => (
                                    <div key={key} className="entity-group">
                                      <strong>{key}</strong>
                                      <div className="token-panel">
                                        {Array.isArray(value) ? (
                                          value.map((item, index) => (
                                            <span key={`${key}-${index}`} className="token-chip">
                                              {String(item)}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="token-chip">{String(value)}</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </article>
                            ) : null}
                          </div>
                          <pre className="scroll-panel code-block raw-analysis-code">
                            {JSON.stringify(detail.analysis, null, 2)}
                          </pre>
                        </DetailAccordion>
                      </div>
                    </div>

                    <DetailAccordion title="QA Evaluation" className="qa-evaluation-accordion">
                      <QaEvaluationPanel
                        qa={detail.qa}
                        isCompleted={isCompletedStatus(detail.status)}
                        isRecalculating={qaRecalculating}
                        onRecalculate={() => void handleRecalculateQa()}
                        recalculateError={qaRecalculateError}
                        generatedAtLabel={formatDate(detail.qa?.evaluation?.generatedAtUtc)}
                        initiallyExpanded
                      />
                    </DetailAccordion>
                  </div>

                  {detail.error ? <p className="error-text">Processing error: {detail.error}</p> : null}
                </>
              ) : (
                <div className="empty-state">
                  <h3>Call not available</h3>
                  <p>Try refreshing the list or selecting a different conversation.</p>
                </div>
              )}
                    </div>,
                    detailPortalTarget,
                  )
                : null}
            </div>
          </section>
        )}
      </main>

      {isUploadModalOpen ? (
        <div className="modal-backdrop" onClick={() => setIsUploadModalOpen(false)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h2>Upload call</h2>
              <p>The conversation ID is generated automatically for each upload.</p>
            </div>

            <form className="grid-form" onSubmit={handleUpload}>
              <label>
                Conversation ID for URL upload
                <input value={uploadState.conversationId} readOnly />
              </label>

              <label>
                Generate new ID
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setUploadState((current) => ({
                      ...current,
                      conversationId: generateConversationId(),
                    }))
                  }
                >
                  Regenerate
                </button>
              </label>

              <label className="full-width">
                Presigned URL
                <input
                  value={uploadState.url}
                  onChange={(event) =>
                    setUploadState((current) => ({ ...current, url: event.target.value, files: [] }))
                  }
                  placeholder="https://storage.example.com/call.wav?signature=..."
                />
              </label>

              <label className="full-width">
                Local audio files
                <input
                  type="file"
                  accept="audio/*"
                  multiple
                  onChange={(event) =>
                    {
                      setUploadValidationMessage("");
                      setUploadErrorMessage("");
                      setUploadState((current) => ({
                        ...current,
                        url: "",
                        files: Array.from(event.target.files ?? []),
                      }));
                    }
                  }
                />
              </label>

              {uploadState.files.length > 0 ? (
                <div className="upload-selection full-width">
                  <strong>{uploadState.files.length} file(s) selected</strong>
                  <ul className="upload-file-list">
                    {uploadState.files.map((file) => (
                      <li key={`${file.name}-${file.lastModified}`}>
                        <span>{file.name}</span>
                        <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </li>
                    ))}
                  </ul>
                  <p>
                    A separate random conversation ID will be generated for each local file during upload.
                  </p>
                </div>
              ) : null}

              <p className="upload-note full-width">
                Client-side sample-rate validation is temporarily disabled for local uploads.
                Presigned URLs are still queued as-is because the browser cannot inspect remote
                files before upload.
              </p>

              {uploadValidationMessage ? (
                <p className="upload-validation full-width">{uploadValidationMessage}</p>
              ) : null}

              {uploadErrorMessage ? (
                <p className="upload-error full-width">{uploadErrorMessage}</p>
              ) : null}

              <div className="modal-actions full-width">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsUploadModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" disabled={!canQueryApi || uploadSubmitting}>
                  {uploadSubmitting
                    ? "Uploading..."
                    : uploadState.files.length > 1
                      ? "Queue analyses"
                      : "Queue analysis"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isRecordingModalOpen ? (
        <div className="modal-backdrop" onClick={closeRecordingModal}>
          <section className="modal-card recording-modal" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h2>Record call</h2>
              <p>Use your microphone to capture a call recording, then upload it directly.</p>
            </div>

            {recordingState === "recording" ? (
              <div className="recording-splash">
                <div className="recording-orb">
                  <span className="recording-orb-core" />
                </div>
                <div className="recording-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <strong>Recording in progress</strong>
                <p>{formatRecordingDuration(recordingDurationSeconds)}</p>
                <button type="button" onClick={stopRecording}>
                  Stop recording
                </button>
              </div>
            ) : (
              <div className="recording-preview">
                <div className="recording-preview-copy">
                  <strong>Recording ready</strong>
                  <p>
                    Duration: {formatRecordingDuration(recordingDurationSeconds)}. Review it, then upload
                    it to the dashboard.
                  </p>
                </div>
                {recordedAudioUrl ? (
                  <audio controls src={recordedAudioUrl} className="audio-player" />
                ) : null}
                {recordingErrorMessage ? <p className="upload-error">{recordingErrorMessage}</p> : null}
                <div className="modal-actions full-width">
                  <button type="button" className="secondary-button" onClick={closeRecordingModal}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void openRecordingModal()}
                  >
                    Record again
                  </button>
                  <button type="button" onClick={() => void handleRecordingUpload()} disabled={recordingUploading}>
                    {recordingUploading ? "Uploading..." : "Upload recording"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {isKeywordManagerOpen ? (
        <div className="modal-backdrop" onClick={() => setIsKeywordManagerOpen(false)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h2>Keyword rules</h2>
              <p>
                Configure transcript keywords that should trigger alerts and recommended actions.
                These rules are saved only in this browser for now.
              </p>
            </div>

            <div className="keyword-manager">
              <div className="editor-group-head">
                <h3>Rules</h3>
                <button type="button" className="secondary-button small-button" onClick={addKeywordRule}>
                  Add keyword
                </button>
              </div>

              {keywordRules.length > 0 ? (
                <div className="keyword-rule-list">
                  {keywordRules.map((rule, index) => (
                    <article key={rule.id} className="keyword-rule-card">
                      <div className="editor-group-head">
                        <h3>Rule {index + 1}</h3>
                        <button
                          type="button"
                          className="secondary-button small-button"
                          onClick={() => removeKeywordRule(rule.id)}
                        >
                          Remove
                        </button>
                      </div>

                      <div className="grid-form keyword-rule-grid">
                        <label>
                          Keyword or phrase
                          <input
                            value={rule.phrase}
                            onChange={(event) =>
                              updateKeywordRule(rule.id, "phrase", event.target.value)
                            }
                            placeholder="chargeback"
                          />
                        </label>

                        <label>
                          Alert label
                          <input
                            value={rule.alertLabel}
                            onChange={(event) =>
                              updateKeywordRule(rule.id, "alertLabel", event.target.value)
                            }
                            placeholder="Fraud escalation"
                          />
                        </label>

                        <label>
                          Badge color
                          <input
                            type="color"
                            value={rule.color}
                            onChange={(event) =>
                              updateKeywordRule(rule.id, "color", event.target.value)
                            }
                            className="keyword-color-input"
                          />
                        </label>

                        <label className="full-width">
                          Required action
                          <textarea
                            value={rule.actionText}
                            onChange={(event) =>
                              updateKeywordRule(rule.id, "actionText", event.target.value)
                            }
                            placeholder="Notify fraud operations and review the call immediately."
                            rows={3}
                          />
                        </label>

                        <label className="keyword-toggle">
                          <span>Enabled</span>
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(event) =>
                              updateKeywordRule(rule.id, "enabled", event.target.checked)
                            }
                          />
                        </label>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact-empty-state">
                  <h3>No keyword rules yet</h3>
                  <p>Add a rule to watch transcripts for important words or phrases.</p>
                </div>
              )}
            </div>

            <div className="modal-actions full-width">
              <button type="button" className="secondary-button" onClick={() => setKeywordRules([])}>
                Clear all
              </button>
              <button type="button" onClick={() => setIsKeywordManagerOpen(false)}>
                Done
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isQaExportModalOpen ? (
        <div className="modal-backdrop" onClick={() => setIsQaExportModalOpen(false)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h2>Export QA monitoring questionnaire</h2>
              <p>
                Select completed conversations that already have transcript and analysis data, then
                download the generated questionnaire files.
              </p>
            </div>

            <div className="qa-export-modal">
              <label className="selection-toggle">
                <input
                  type="checkbox"
                  checked={allExportableSelected}
                  onChange={(event) =>
                    setSelectedConversationIds(
                      event.target.checked ? exportableCalls.map((call) => call.conversationId) : [],
                    )
                  }
                  disabled={exportableCalls.length === 0}
                />
                <span>Select all completed conversations</span>
              </label>

              <div className="qa-export-list">
                {exportableCalls.length > 0 ? (
                  exportableCalls.map((call) => (
                    <label key={call.conversationId} className="qa-export-item">
                      <input
                        type="checkbox"
                        checked={selectedConversationIds.includes(call.conversationId)}
                        onChange={() => toggleConversationSelection(call.conversationId)}
                      />
                      <div className="qa-export-copy">
                        <strong>{call.conversationId}</strong>
                        <span>
                          {call.sentiment ?? "unknown"} · score {call.satisfactionScore ?? "-"} · created{" "}
                          {formatDate(call.createdUtc)}
                        </span>
                      </div>
                    </label>
                  ))
                ) : (
                  <div className="empty-state compact-empty-state">
                    <h3>No completed conversations</h3>
                    <p>Only completed calls can be exported as QA monitoring questionnaires.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-actions full-width">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setIsQaExportModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleQaExport()}
                disabled={selectedConversationIds.length === 0 || qaExportSubmitting}
              >
                {qaExportSubmitting
                  ? "Exporting QA questionnaires..."
                  : selectedConversationIds.length > 0
                    ? `Export ${selectedConversationIds.length} questionnaire${selectedConversationIds.length === 1 ? "" : "s"}`
                    : "Export questionnaires"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isHeaderEditorOpen ? (
        <div className="modal-backdrop" onClick={() => setIsHeaderEditorOpen(false)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h2>Edit header graphic</h2>
              <p>Choose which metrics appear in the built-in dashboard graphic. Changes are saved in this browser.</p>
            </div>

            <div className="header-editor-grid">
              <div className="editor-group">
                <div className="editor-group-head">
                  <h3>Bars</h3>
                  <button type="button" className="secondary-button small-button" onClick={addHeaderBar}>
                    Add bar
                  </button>
                </div>

                <div className="editor-list">
                  {headerGraphicConfig.bars.map((metric, index) => (
                    <div key={`bar-${index}`} className="editor-row">
                      <label>
                        Bar {index + 1}
                        <select
                          value={metric}
                          onChange={(event) =>
                            setHeaderGraphicConfig((current) => {
                              const nextBars = [...current.bars];
                              nextBars[index] = event.target.value as HeaderMetric;
                              return { ...current, bars: nextBars };
                            })
                          }
                        >
                          {headerMetricOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="secondary-button small-button"
                        onClick={() => removeHeaderBar(index)}
                        disabled={headerGraphicConfig.bars.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="editor-group">
                <div className="editor-group-head">
                  <h3>Summaries</h3>
                  <button type="button" className="secondary-button small-button" onClick={addHeaderSummary}>
                    Add summary
                  </button>
                </div>

                <div className="editor-list">
                  {headerGraphicConfig.summaries.map((metric, index) => (
                    <div key={`summary-${index}`} className="editor-row">
                      <label>
                        Summary {index + 1}
                        <select
                          value={metric}
                          onChange={(event) =>
                            setHeaderGraphicConfig((current) => {
                              const nextSummaries = [...current.summaries];
                              nextSummaries[index] = event.target.value as HeaderMetric;
                              return { ...current, summaries: nextSummaries };
                            })
                          }
                        >
                          {headerMetricOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="secondary-button small-button"
                        onClick={() => removeHeaderSummary(index)}
                        disabled={headerGraphicConfig.summaries.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-actions full-width">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setHeaderGraphicConfig(defaultHeaderGraphicConfig)}
              >
                Reset defaults
              </button>
              <button type="button" onClick={() => setIsHeaderEditorOpen(false)}>
                Done
              </button>
            </div>
          </section>
        </div>
      ) : null}
      </div>
    </div>
  );
}

export default App;
