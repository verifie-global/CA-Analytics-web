import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchAudioBlob, fetchCallDetail, fetchCalls, uploadCall, verifyAuthorization } from "./api";
import type { AppSettings, CallDetail, CallFilters, CallSummary } from "./types";

const STORAGE_KEY = "ca-analytics-settings";

const defaultSettings: AppSettings = {
  baseUrl: "https://ca.satisfai.cx",
  companyId: "",
  token: "",
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

const formatDuration = (seconds?: number | null) => {
  if (seconds == null) return "-";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
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

function readWavSampleRate(bytes: Uint8Array) {
  if (bytes.length < 44) {
    throw new Error("WAV file is too small to validate.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const wave = String.fromCharCode(...bytes.slice(8, 12));

  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Unsupported audio format for sample rate validation. Please upload a WAV file.");
  }

  let offset = 12;

  while (offset + 8 <= view.byteLength) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === "fmt ") {
      if (offset + 16 > view.byteLength) {
        break;
      }

      return view.getUint32(offset + 12, true);
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  throw new Error("Unable to find sample rate information in the WAV file.");
}

async function validateAudioFileSampleRate(file: File) {
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
}

function App() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultSettings;

    try {
      return { ...defaultSettings, ...(JSON.parse(saved) as Partial<AppSettings>) };
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
  const [statusMessage, setStatusMessage] = useState<string>("Enter your company ID and API token to get started.");
  const [callsLoading, setCallsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string>("");
  const [uploadValidationMessage, setUploadValidationMessage] = useState<string>("");
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [uploadState, setUploadState] = useState({
    conversationId: generateConversationId(),
    url: "",
    file: null as File | null,
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setDraftSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!settings.companyId || !settings.token) {
      setIsAuthorized(false);
      return;
    }

    let cancelled = false;

    const checkAuthorization = async () => {
      setAuthChecking(true);

      try {
        await verifyAuthorization(settings);
        if (!cancelled) {
          setIsAuthorized(true);
          setStatusMessage("Authorization successful.");
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
    () => Boolean(settings.baseUrl && settings.companyId && settings.token),
    [settings],
  );

  const refreshCalls = async (
    activeSettings: AppSettings = settings,
    options?: { silent?: boolean },
  ) => {
    if (!activeSettings.baseUrl || !activeSettings.companyId || !activeSettings.token) {
      setErrorMessage("Add a base URL, company ID, and bearer token before loading calls.");
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
      await verifyAuthorization(draftSettings);
      setSettings(draftSettings);
      setIsAuthorized(true);
      setStatusMessage("Authorization successful. Loading dashboard...");
      setTimeout(() => {
        void refreshCalls(draftSettings);
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
      setAudioRequestedFor("");
      setAudioPendingFor("");
    }

    try {
      const nextDetail = await fetchCallDetail(settings, conversationId);
      setDetail(nextDetail);
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
      file: null,
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

    if (!uploadState.conversationId || (!uploadState.url && !uploadState.file)) {
      setUploadErrorMessage("Provide a conversation ID and either a presigned URL or an audio file.");
      return;
    }

    setErrorMessage("");
    setUploadValidationMessage("");
    setUploadErrorMessage("");
    setUploadSubmitting(true);
    setStatusMessage("Uploading call and queuing analysis...");

    try {
      if (uploadState.file) {
        const sampleRate = await validateAudioFileSampleRate(uploadState.file);
        setUploadValidationMessage(`Validated local audio at ${sampleRate} Hz.`);
      }

      await uploadCall(settings, uploadState);
      setStatusMessage(`Upload accepted. ${uploadState.conversationId} is now queued for analysis.`);
      setIsUploadModalOpen(false);
      setUploadState({ conversationId: generateConversationId(), url: "", file: null });
      setUploadValidationMessage("");
      setUploadErrorMessage("");
      await refreshCalls();
      await handleLoadDetail(uploadState.conversationId);
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
    setStatusMessage("You have been logged out.");
    setUploadState({
      conversationId: generateConversationId(),
      url: "",
      file: null,
    });
  };

  const transcript = detail?.transcript?.trim();
  const redactedTranscript = detail?.redactedTranscript?.trim();
  const summary = detail?.summary?.trim();
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
  const maxSentimentCount = Math.max(positiveCount, neutralCount, negativeCount, 1);

  if (!isAuthorized) {
    return (
      <div className="app-shell auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Authorization</p>
          <h1>Call Analytics Dashboard</h1>
          <p className="hero-copy">
            Enter your company ID and bearer token. We will verify them against the backend
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
              Bearer token
              <input
                type="password"
                value={draftSettings.token}
                onChange={(event) =>
                  setDraftSettings((current) => ({ ...current, token: event.target.value }))
                }
                placeholder="company API token"
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
          <div className="hero-graphic">
            <div className="hero-bars" aria-label="Sentiment overview">
              <div className="hero-bar-group">
                <span
                  className="hero-bar hero-bar-positive"
                  style={{ height: `${(positiveCount / maxSentimentCount) * 100}%` }}
                />
                <label>Positive</label>
                <strong>{positiveCount}</strong>
              </div>
              <div className="hero-bar-group">
                <span
                  className="hero-bar hero-bar-neutral"
                  style={{ height: `${(neutralCount / maxSentimentCount) * 100}%` }}
                />
                <label>Neutral</label>
                <strong>{neutralCount}</strong>
              </div>
              <div className="hero-bar-group">
                <span
                  className="hero-bar hero-bar-negative"
                  style={{ height: `${(negativeCount / maxSentimentCount) * 100}%` }}
                />
                <label>Negative</label>
                <strong>{negativeCount}</strong>
              </div>
            </div>
            <div className="hero-summary">
              <div>
                <span>Average score</span>
                <strong>{avgScore ?? "-"}</strong>
              </div>
              <div>
                <span>Scored calls</span>
                <strong>{calls.filter((call) => typeof call.satisfactionScore === "number").length}</strong>
              </div>
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
                      <span>Duration: {formatDuration(call.durationSeconds)}</span>
                      <span>{call.language ?? "No language"}</span>
                    </div>
                    <small>Created {formatDate(call.createdUtc)}</small>
                    {call.error ? <small className="error-text">{call.error}</small> : null}
                  </button>
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
                    <span className="tag">
                      {audioLoading || audioPendingFor === detail.conversationId
                        ? "Preparing audio playback"
                        : audioUrl
                          ? "Playback ready"
                          : "No audio yet"}
                    </span>
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
                      <label>Duration</label>
                      <strong>{formatDuration(detail.durationSeconds)}</strong>
                    </article>
                  </div>

                  {audioUrl ? (
                    <audio controls src={audioUrl} className="audio-player" />
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
                      <div className="scroll-panel chat-panel">
                        {detail.segments.length === 0 ? (
                          <p>No speaker segments available.</p>
                        ) : (
                          detail.segments.map((segment, index) => (
                            <article
                              key={`${segment.speaker}-${index}`}
                              className={`segment-card role-${(segment.role ?? "UNKNOWN").toLowerCase()}`}
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
                      <h4>Entities</h4>
                      <pre className="scroll-panel code-block">
                        {JSON.stringify(detail.entities, null, 2)}
                      </pre>
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
                Conversation ID
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
                    setUploadState((current) => ({ ...current, url: event.target.value }))
                  }
                  placeholder="https://storage.example.com/call.wav?signature=..."
                />
              </label>

              <label className="full-width">
                Local audio file
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(event) =>
                    {
                      setUploadValidationMessage("");
                      setUploadErrorMessage("");
                      setUploadState((current) => ({
                        ...current,
                        file: event.target.files?.[0] ?? null,
                      }));
                    }
                  }
                />
              </label>

              <p className="upload-note full-width">
                Local uploads must be WAV files with at least a 16000 Hz sample rate. Other audio
                formats are not validated client-side and are blocked to avoid false results.
                Presigned URLs are queued as-is because the browser cannot inspect remote files
                before upload.
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
                  {uploadSubmitting ? "Uploading..." : "Queue analysis"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default App;
