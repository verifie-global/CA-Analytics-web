import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { authorizeSettings, fetchAudioBlob, fetchCallDetail, fetchCalls, uploadCall } from "./api";
import type { AppSettings, CallDetail, CallFilters, CallSummary } from "./types";

const STORAGE_KEY = "ca-analytics-settings";
const HEADER_GRAPHIC_STORAGE_KEY = "ca-analytics-header-graphic";
const KEYWORD_RULES_STORAGE_KEY = "ca-analytics-keyword-rules";

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

type KeywordBadgeMatch = {
  label: string;
  color: string;
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

const defaultSettings: AppSettings = {
  baseUrl: "https://ca.satisfai.cx",
  companyId: "",
  apiToken: "",
  accessToken: "",
  tokenType: "Bearer",
  companyName: "",
  expiresAtUtc: "",
};

const defaultFilters: CallFilters = {
  page: 1,
  pageSize: 100,
  search: "",
  conversationId: "",
  status: "",
  sentiment: "",
  hasError: "",
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

const classForSentiment = (value?: string) => {
  if (!value) return "tag";
  return `tag sentiment-${value.toLowerCase()}`;
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
  const [filters, setFilters] = useState<CallFilters>(defaultFilters);
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
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
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string>("");
  const [isHeaderEditorOpen, setIsHeaderEditorOpen] = useState(false);
  const [isKeywordManagerOpen, setIsKeywordManagerOpen] = useState(false);
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const diarizationContainerRef = useRef<HTMLDivElement | null>(null);
  const [uploadState, setUploadState] = useState({
    conversationId: generateConversationId(),
    url: "",
    files: [] as File[],
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setDraftSettings(settings);
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(HEADER_GRAPHIC_STORAGE_KEY, JSON.stringify(headerGraphicConfig));
  }, [headerGraphicConfig]);

  useEffect(() => {
    localStorage.setItem(KEYWORD_RULES_STORAGE_KEY, JSON.stringify(keywordRules));
  }, [keywordRules]);

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
        } catch {
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

  const refreshCalls = async (
    activeSettings: AppSettings = settings,
    options?: { silent?: boolean },
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
      const nextCalls = await fetchCalls(activeSettings, filters);
      setCalls(nextCalls);
      if (!options?.silent) {
        setStatusMessage(`Loaded ${nextCalls.length} call${nextCalls.length === 1 ? "" : "s"}.`);
      }

      if (selectedId && !nextCalls.some((call) => call.conversationId === selectedId)) {
        setSelectedId("");
        setDetail(null);
      }
    } catch (error) {
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

    localStorage.removeItem(STORAGE_KEY);
    setSettings(defaultSettings);
    setDraftSettings(defaultSettings);
    setCalls([]);
    setSelectedId("");
    setDetail(null);
    setAudioUrl("");
    setAudioRequestedFor("");
    setAudioPendingFor("");
    setIsAuthorized(false);
    setIsUploadModalOpen(false);
    setUploadSubmitting(false);
    setUploadValidationMessage("");
    setUploadErrorMessage("");
    setErrorMessage("");
    setTranscriptCache({});
    setStatusMessage("You have been logged out.");
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

  const getKeywordBadgeMatches = (transcriptValue?: string | null): KeywordBadgeMatch[] => {
    if (!transcriptValue?.trim()) {
      return [];
    }

    return keywordRules
      .filter((rule) => rule.enabled && rule.phrase.trim())
      .flatMap((rule) => {
        const matches = transcriptValue.match(new RegExp(escapeRegExp(rule.phrase.trim()), "gi"));
        if (!matches || matches.length === 0) {
          return [];
        }

        return [
          {
            label: rule.alertLabel.trim() || rule.phrase.trim(),
            color: rule.color || "#ffc83d",
          },
        ];
      });
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
  const keywordBadgeMatches = useMemo(
    () =>
      calls.reduce<Record<string, KeywordBadgeMatch[]>>((result, call) => {
        result[call.conversationId] = getKeywordBadgeMatches(transcriptCache[call.conversationId]);
        return result;
      }, {}),
    [calls, transcriptCache, keywordRules],
  );
  const positiveCount = calls.filter((call) => call.sentiment?.toLowerCase() === "positive").length;
  const neutralCount = calls.filter((call) => call.sentiment?.toLowerCase() === "neutral").length;
  const negativeCount = calls.filter((call) => call.sentiment?.toLowerCase() === "negative").length;
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
  const completedCount = calls.filter((call) => call.status?.toLowerCase() === "completed").length;
  const failedCount = calls.filter((call) => call.status?.toLowerCase() === "failed").length;
  const inProgressCount = calls.filter((call) => isInProgressStatus(call.status)).length;
  const metricValues: Record<
    HeaderMetric,
    { value: number | null; max: number; formatted: string; description: string }
  > = {
    total_calls: {
      value: calls.length,
      max: Math.max(calls.length, 1),
      formatted: String(calls.length),
      description: "Total calls currently visible in the dashboard",
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
      value: positiveCount,
      max: Math.max(calls.length, 1),
      formatted: String(positiveCount),
      description: "Calls with positive sentiment",
    },
    neutral_calls: {
      value: neutralCount,
      max: Math.max(calls.length, 1),
      formatted: String(neutralCount),
      description: "Calls with neutral sentiment",
    },
    negative_calls: {
      value: negativeCount,
      max: Math.max(calls.length, 1),
      formatted: String(negativeCount),
      description: "Calls with negative sentiment",
    },
    avg_satisfaction: {
      value: avgScore ? Number(avgScore) : null,
      max: 10,
      formatted: avgScore ? `${avgScore}/10` : "N/A",
      description: "Average satisfaction score across visible calls",
    },
    avg_friendliness: {
      value: avgFriendliness ? Number(avgFriendliness) : null,
      max: 10,
      formatted: avgFriendliness ? `${avgFriendliness}/10` : "N/A",
      description: "Average friendliness score across visible calls",
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

  if (!isAuthorized) {
    return (
      <div className="app-shell auth-shell">
        <section className="auth-card">
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

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Authorized workspace</p>
          <h1>Call Analytics Dashboard</h1>
          <p className="hero-copy">
            Upload audio, monitor processing, and inspect transcripts, diarization, sentiment,
            and satisfaction scores from your backend.
          </p>
          <button
            type="button"
            className="secondary-button small-button hero-edit-button"
            onClick={() => setIsHeaderEditorOpen(true)}
          >
            Edit graphic
          </button>
          <div className="hero-graphic">
            <div className="hero-bars" aria-label="Sentiment overview">
              {headerGraphicConfig.bars.map((metric) => {
                const metricData = metricValues[metric];
                const optionLabel =
                  headerMetricOptions.find((option) => option.value === metric)?.label ?? metric;
                const heightPercent =
                  metricData.value == null || metricData.max <= 0
                    ? 0
                    : (metricData.value / metricData.max) * 100;

                return (
                  <div key={metric} className="hero-bar-group">
                    <div className="hero-bar-shell">
                      <span
                        className={`hero-bar ${headerBarClassByMetric(metric)}`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <label>{optionLabel}</label>
                    <strong>{metricData.formatted}</strong>
                  </div>
                );
              })}
            </div>
            <div className="hero-summary">
              {headerGraphicConfig.summaries.map((metric) => {
                const metricData = metricValues[metric];
                const optionLabel =
                  headerMetricOptions.find((option) => option.value === metric)?.label ?? metric;

                return (
                  <div key={metric}>
                    <span>{optionLabel}</span>
                    <strong>{metricData.formatted}</strong>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="hero-card">
          <div className="hero-stat">
            <span>{calls.length}</span>
            <label>visible calls</label>
          </div>
          <div className="hero-stat">
            <span>{detail?.status ?? "Idle"}</span>
            <label>selected status</label>
          </div>
          <button type="button" onClick={openUploadModal}>
            Upload call
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setIsKeywordManagerOpen(true)}
          >
            Keyword rules
          </button>
          <button type="button" className="secondary-button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="section-heading">
            <h2>Call explorer</h2>
            <p>Filter your company calls, then open one to inspect the full analysis.</p>
          </div>

          <form
            className="filters"
            onSubmit={(event) => {
              event.preventDefault();
              void refreshCalls();
            }}
          >
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search transcript or metadata"
            />
            <input
              value={filters.conversationId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, conversationId: event.target.value }))
              }
              placeholder="Conversation ID"
            />
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
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
                setFilters((current) => ({ ...current, sentiment: event.target.value }))
              }
            >
              <option value="">All sentiment</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
            <select
              value={filters.hasError}
              onChange={(event) => setFilters((current) => ({ ...current, hasError: event.target.value }))}
            >
              <option value="">Errors or not</option>
              <option value="true">Only errors</option>
              <option value="false">No errors</option>
            </select>
            <input
              type="number"
              min="1"
              value={filters.page}
              onChange={(event) =>
                setFilters((current) => ({ ...current, page: Number(event.target.value) || 1 }))
              }
              placeholder="Page"
            />
            <input
              type="number"
              min="1"
              max="100"
              value={filters.pageSize}
              onChange={(event) =>
                setFilters((current) => ({ ...current, pageSize: Number(event.target.value) || 100 }))
              }
              placeholder="Page size"
            />
            <button type="submit" disabled={!canQueryApi || callsLoading}>
              {callsLoading ? "Loading..." : "Refresh"}
            </button>
          </form>

          <div className="status-strip">
            <span>{statusMessage}</span>
            {errorMessage ? <strong>{errorMessage}</strong> : null}
          </div>

          <div className="workspace">
            <div className="list-column">
              {calls.length === 0 ? (
                <div className="empty-state">
                  <h3>No calls loaded yet</h3>
                  <p>Save your connection settings, then load or upload a call.</p>
                </div>
              ) : (
                calls.map((call) => (
                  (() => {
                    const keywordMatchesForList = keywordBadgeMatches[call.conversationId] ?? [];
                    const isKeywordScanPending =
                      keywordRules.length > 0 && transcriptCache[call.conversationId] == null;
                    const visibleKeywordLabels = keywordMatchesForList.slice(0, 2);
                    const hiddenKeywordCount = Math.max(
                      0,
                      keywordMatchesForList.length - visibleKeywordLabels.length,
                    );

                    return (
                      <button
                        key={call.conversationId}
                        type="button"
                        className={`call-card ${selectedId === call.conversationId ? "selected" : ""}`}
                        onClick={() => void handleLoadDetail(call.conversationId)}
                      >
                        <div className="call-card-head">
                          <strong>{call.conversationId}</strong>
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
                        </div>
                        <div className="call-card-grid">
                          <span className={classForSentiment(call.sentiment)}>{call.sentiment ?? "unknown"}</span>
                          <span>Score: {call.satisfactionScore ?? "-"}</span>
                          <span>{call.language ?? "No language"}</span>
                          {keywordRules.length > 0 ? (
                            <span className="keyword-list-badges">
                              {isKeywordScanPending ? (
                                <span className="tag keyword-list-badge">Checking keywords...</span>
                              ) : keywordMatchesForList.length > 0 ? (
                                <>
                                  {visibleKeywordLabels.map((keywordMatch) => (
                                    <span
                                      key={`${call.conversationId}-${keywordMatch.label}`}
                                      className="tag keyword-list-badge"
                                      style={{
                                        backgroundColor: `${keywordMatch.color}26`,
                                        color: keywordMatch.color,
                                        borderColor: `${keywordMatch.color}4d`,
                                      }}
                                    >
                                      {keywordMatch.label}
                                    </span>
                                  ))}
                                  {hiddenKeywordCount > 0 ? (
                                    <span className="tag keyword-list-badge">
                                      +{hiddenKeywordCount} more
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <span className="tag keyword-list-badge">No keyword</span>
                              )}
                            </span>
                          ) : null}
                        </div>
                        <small>Created {formatDate(call.createdUtc)}</small>
                        {call.error ? <small className="error-text">{call.error}</small> : null}
                      </button>
                    );
                  })()
                ))
              )}
            </div>

            <div className="detail-column">
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
                  <div className="detail-header">
                    <div>
                      <p className="eyebrow">Conversation</p>
                      <h3>{detail.conversationId}</h3>
                    </div>
                    <div className="detail-header-tags">
                      <span className="tag">
                        {audioLoading || audioPendingFor === detail.conversationId
                          ? "Preparing audio playback"
                          : audioUrl
                            ? "Playback ready"
                            : "No audio yet"}
                      </span>
                      <span className={`tag ${keywordMatches.length > 0 ? "tag-warning" : ""}`}>
                        {keywordMatches.length > 0
                          ? `${keywordMatches.length} keyword alert${keywordMatches.length === 1 ? "" : "s"}`
                          : "No keyword alerts"}
                      </span>
                    </div>
                  </div>

                  <div className="stat-grid">
                    <article>
                      <label>Status</label>
                      <strong className={isInProgressStatus(detail.status) ? "status-animated-text" : ""}>
                        {detail.status}
                      </strong>
                    </article>
                    <article>
                      <label>Sentiment</label>
                      <strong>{detail.sentiment ?? "-"}</strong>
                    </article>
                    <article>
                      <label>Satisfaction</label>
                      <strong>{detail.satisfactionScore ?? "-"}</strong>
                    </article>
                    <article>
                      <label>Friendliness</label>
                      <strong><FriendlinessIndicator value={detail.friendlinessScore} /></strong>
                    </article>
                  </div>

                  {audioUrl ? (
                    <audio
                      ref={audioRef}
                      controls
                      src={audioUrl}
                      className="audio-player"
                      onTimeUpdate={(event) => setPlaybackTimeSeconds(event.currentTarget.currentTime)}
                      onLoadedMetadata={(event) => setPlaybackTimeSeconds(event.currentTarget.currentTime)}
                      onEnded={() => setPlaybackTimeSeconds(0)}
                    />
                  ) : (
                    <div className="audio-placeholder">
                      {audioLoading || audioPendingFor === detail.conversationId ? (
                        <span className="status-inline">
                          <span className="status-pulse" />
                          Preparing audio file for playback...
                        </span>
                      ) : detail.status === "Completed" ? (
                        "Preparing audio file for playback..."
                      ) : (
                        "Audio playback will appear when the call is completed."
                      )}
                    </div>
                  )}

                  <div className="detail-panels">
                    <section>
                      <h4>Keyword alerts</h4>
                      <div className="scroll-panel keyword-panel">
                        {keywordMatches.length > 0 ? (
                          keywordMatches.map((match) => (
                            <article
                              key={match.rule.id}
                              className="keyword-card"
                              style={{
                                borderColor: `${match.rule.color}42`,
                                backgroundColor: `${match.rule.color}14`,
                              }}
                            >
                              <div className="keyword-card-head">
                                <strong>{match.rule.alertLabel || match.rule.phrase}</strong>
                                <span
                                  className="token-chip"
                                  style={{
                                    backgroundColor: `${match.rule.color}22`,
                                    color: match.rule.color,
                                    borderColor: `${match.rule.color}4d`,
                                  }}
                                >
                                  {match.count} hit{match.count === 1 ? "" : "s"}
                                </span>
                              </div>
                              <p>
                                <strong>Keyword:</strong> {match.rule.phrase}
                              </p>
                              <p>
                                <strong>Action:</strong> {match.rule.actionText || "No action set."}
                              </p>
                            </article>
                          ))
                        ) : keywordRules.length > 0 ? (
                          <p>No configured keywords were found in this transcript.</p>
                        ) : (
                          <p>
                            No keyword rules yet. Add them from the dashboard to trigger transcript alerts.
                          </p>
                        )}
                      </div>
                    </section>

                    <section>
                      <h4>Summarization</h4>
                      <div className="scroll-panel prose-block copy-panel">
                        <button
                          type="button"
                          className={`icon-button ${copiedSection === "summary" ? "is-copied" : ""}`}
                          onClick={() => void handleCopy("summary", summary)}
                          disabled={!summary}
                          aria-label="Copy summarization"
                          title={copiedSection === "summary" ? "Copied" : "Copy"}
                        >
                          <CopyIcon />
                        </button>
                        {summary ? summary : "No summary available yet."}
                      </div>
                    </section>

                    <section>
                      <h4>Diarization</h4>
                      <div ref={diarizationContainerRef} className="scroll-panel chat-panel">
                        {detail.segments.length === 0 ? (
                          <p>No speaker segments available.</p>
                        ) : (
                          detail.segments.map((segment, index) => (
                            <article
                              data-segment-index={index}
                              key={`${segment.speaker}-${index}`}
                              className={`segment-card role-${(segment.role ?? "UNKNOWN").toLowerCase()} ${activeSegmentIndex === index ? "segment-active" : ""}`}
                              onClick={() => handleSeekToSegment(segment.startMs)}
                            >
                              <div className="segment-meta">
                                <strong>
                                  {segment.role === "AGENT"
                                    ? "Agent"
                                    : segment.role === "CUSTOMER"
                                      ? "Customer"
                                      : segment.speaker}
                                </strong>
                                <span>
                                  {formatTimestamp(segment.startMs)} - {formatTimestamp(segment.endMs)}
                                </span>
                              </div>
                              <p>{segment.text}</p>
                            </article>
                          ))
                        )}
                      </div>
                    </section>

                    <section>
                      <h4>Original transcription</h4>
                      <div className="scroll-panel prose-block copy-panel">
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
                    </section>

                    <section>
                      <h4>Redacted transcription</h4>
                      <div className="scroll-panel prose-block redacted-panel">
                        {redactedTranscript
                          ? renderRedactedTranscript(redactedTranscript)
                          : "No redacted transcription available yet."}
                      </div>
                    </section>

                    <section>
                      <h4>Topics</h4>
                      <div className="scroll-panel token-panel">
                        {topics.length > 0 ? (
                          topics.map((topic, index) => (
                            <span key={`${topic}-${index}`} className="token-chip">
                              {topic}
                            </span>
                          ))
                        ) : (
                          <p>No topics available.</p>
                        )}
                      </div>
                    </section>

                    <section>
                      <h4>Routing</h4>
                      <div className="scroll-panel routing-panel">
                        <article className="routing-card">
                          <label>Related department</label>
                          <strong>{relatedDepartment ?? "N/A"}</strong>
                        </article>
                        <article className="routing-card">
                          <label>Task urgency</label>
                          <strong className={`urgency-badge ${taskUrgency ? `urgency-${taskUrgency.toLowerCase()}` : ""}`}>
                            {taskUrgency ?? "N/A"}
                          </strong>
                        </article>
                      </div>
                    </section>

                    <section>
                      <h4>Entities</h4>
                      <div className="scroll-panel entity-panel">
                        {entityEntries.length > 0 ? (
                          entityEntries.map(([key, value]) => (
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
                          ))
                        ) : (
                          <p>No entities available.</p>
                        )}
                      </div>
                    </section>

                    <section>
                      <h4>Customer concerns</h4>
                      <div className="scroll-panel concern-panel">
                        {customerConcerns.length > 0 ? (
                          customerConcerns.map((concern, index) => {
                            const resolved = Boolean(concern.resolved);
                            const actionsTaken = Array.isArray(concern.actionsTaken)
                              ? (concern.actionsTaken as string[])
                              : [];

                            return (
                              <article key={`concern-${index}`} className="concern-card">
                                <div className="concern-head">
                                  <strong>{String(concern.concern ?? `Concern ${index + 1}`)}</strong>
                                  <span className={`bool-badge ${resolved ? "bool-true" : "bool-false"}`}>
                                    {resolved ? "Resolved" : "Not resolved"}
                                  </span>
                                </div>
                                {concern.customerQuestion ? (
                                  <p>
                                    <strong>Question:</strong> {String(concern.customerQuestion)}
                                  </p>
                                ) : null}
                                {actionsTaken.length > 0 ? (
                                  <div className="token-panel">
                                    {actionsTaken.map((action, actionIndex) => (
                                      <span key={`action-${index}-${actionIndex}`} className="token-chip">
                                        {action}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </article>
                            );
                          })
                        ) : (
                          <p>No customer concerns available.</p>
                        )}
                      </div>
                    </section>

                    <section>
                      <h4>Coaching assistance</h4>
                      <div className="scroll-panel coaching-panel">
                        {coachingAssistance.length > 0 ? (
                          coachingAssistance.map((item, index) => (
                            <article key={`coaching-${index}`} className="coaching-card">
                              <strong>Recommendation {index + 1}</strong>
                              <p>{item}</p>
                            </article>
                          ))
                        ) : (
                          <p>No coaching assistance available.</p>
                        )}
                      </div>
                    </section>

                    <section>
                      <h4>Raw analysis</h4>
                      <pre className="scroll-panel code-block">
                        {JSON.stringify(detail.analysis, null, 2)}
                      </pre>
                    </section>
                  </div>

                  {detail.error ? <p className="error-text">Processing error: {detail.error}</p> : null}
                </>
              ) : (
                <div className="empty-state">
                  <h3>Call not available</h3>
                  <p>Try refreshing the list or selecting a different conversation.</p>
                </div>
              )}
            </div>
          </div>
        </section>
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
  );
}

export default App;
