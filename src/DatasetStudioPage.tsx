import { useCallback, useEffect, useRef, useState } from "react";
import {
  exportAnnotationDataset, fetchAnnotationClips, fetchAnnotationSession,
  fetchAnnotationSessions, retryAnnotationRecordings, type RequestError,
} from "./api";
import type { AppSettings } from "./types";
import type {
  AnnotationClip, AnnotationDraft, AnnotationFilter, AnnotationPage,
  AnnotationSession, AnnotationSessionSummary, DatasetWorkspace,
} from "./datasetStudioTypes";
import { createDatasetWorkspace } from "./datasetStudioTypes";
import { annotationExportBlocker, annotationSessionCounts, createAnnotationDraft, formatClipTime, isAnnotationDraftDirty } from "./datasetStudioModel";
import { DatasetCreateSession } from "./DatasetCreateSession";
import { DatasetClipEditor } from "./DatasetClipEditor";
import { getIntlLocale } from "./i18n";

type Props = { settings: AppSettings; onUnauthorized: () => void; workspace?: DatasetWorkspace };
const filters: { value: AnnotationFilter; label: string }[] = [
  { value: "pending", label: "Needs review" }, { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" }, { value: "all", label: "All clips" },
];
const pageIsVisible = () => document.visibilityState !== "hidden";

export function DatasetStudioPage({ settings, onUnauthorized, workspace: suppliedWorkspace }: Props) {
  const ownWorkspace = useRef<DatasetWorkspace>(createDatasetWorkspace());
  const workspace = suppliedWorkspace ?? ownWorkspace.current;
  const [sessionId, setSessionId] = useState(workspace.sessionId);
  const [creating, setCreating] = useState(false);
  const [sessions, setSessions] = useState<AnnotationSessionSummary[]>([]);
  const [session, setSession] = useState<AnnotationSession | null>(null);
  const [clips, setClips] = useState<AnnotationPage<AnnotationClip> | null>(null);
  const [selectedClip, setSelectedClip] = useState<AnnotationClip | null>(null);
  const [filter, setFilter] = useState<AnnotationFilter>("pending");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [, renderDrafts] = useState(0);
  const callbacks = useRef({ onUnauthorized });
  callbacks.current = { onUnauthorized };
  const mounted = useRef(true);
  const savingVersion = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const reportError = useCallback((reason: unknown) => {
    if ((reason as RequestError).status === 401) callbacks.current.onUnauthorized();
    return reason instanceof Error ? reason.message : "Dataset Studio could not reach the service. Please try again.";
  }, []);

  useEffect(() => {
    if (sessionId || creating) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetchAnnotationSessions(settings, controller.signal).then((result) => {
      if (!controller.signal.aborted) setSessions(result);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reportError(reason));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [settings.baseUrl, settings.companyId, settings.accessToken, sessionId, creating, refresh, reportError]);

  useEffect(() => {
    if (!sessionId || creating) return;
    let cancelled = false;
    let inFlight = false;
    let controller: AbortController | undefined;
    let timer: number | undefined;
    let shouldPoll = true;
    setLoading(true);
    setError("");
    const load = async () => {
      if (cancelled || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      controller = new AbortController();
      const signal = controller.signal;
      const version = savingVersion.current;
      try {
        // A single sequential loop prevents overlapping polls and stale save responses.
        const detail = await fetchAnnotationSession(settings, sessionId, signal);
        const result = await fetchAnnotationClips(settings, sessionId, filter, page, signal);
        if (cancelled || signal.aborted || version !== savingVersion.current) return;
        setSession(detail);
        setClips(result);
        setSelectedClip((previous) => previous ?? result.items[0] ?? null);
        setError("");
        shouldPoll = annotationSessionCounts(detail).active > 0;
        const lastPage = Math.max(1, Math.ceil(result.total / (result.pageSize || 50)));
        if (page > lastPage) setPage(lastPage);
      } catch (reason) {
        if (cancelled || signal.aborted) return;
        setError(reportError(reason));
        shouldPoll = (reason as RequestError).status !== 401 && (reason as RequestError).status !== 403 && (reason as RequestError).status !== 404;
      } finally {
        inFlight = false;
        if (!cancelled && signal.aborted && pageIsVisible()) timer = window.setTimeout(() => void load(), 0);
        if (!cancelled && !signal.aborted) {
          setLoading(false);
          if (shouldPoll && pageIsVisible()) timer = window.setTimeout(() => void load(), 5000);
        }
      }
    };
    const visibilityChanged = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "hidden") controller?.abort();
      else void load();
    };
    void load();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [settings.baseUrl, settings.companyId, settings.accessToken, sessionId, creating, filter, page, refresh, reportError]);

  // Standalone use gets the same reload protection as the App-owned workspace.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (workspace.drafts.size) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [workspace]);

  const openSession = (id: string) => {
    workspace.sessionId = id;
    setSessionId(id);
    setSession(null);
    setClips(null);
    setSelectedClip(null);
    setFilter("pending");
    setPage(1);
    setCreating(false);
    setActionError("");
    setNotice("");
    setLoading(true);
  };

  const updateDraft = (draft: AnnotationDraft, discard = false) => {
    if (isAnnotationDraftDirty(draft)) workspace.drafts.set(draft.clip.id, draft);
    else {
      const existing = workspace.drafts.get(draft.clip.id);
      // A save that finished after navigation must not delete newer local edits.
      if (discard || !existing || existing.clip.revision === draft.clip.revision || (
        existing.text === draft.text && existing.note === draft.note &&
        Number(existing.start) === Number(draft.start) && Number(existing.end) === Number(draft.end)
      )) workspace.drafts.delete(draft.clip.id);
    }
    if (mounted.current) renderDrafts((value) => value + 1);
  };

  const clipSaved = (saved: AnnotationClip, next: boolean) => {
    savingVersion.current++;
    setClips((previous) => previous && ({ ...previous, items: previous.items.map((clip) => clip.id === saved.id ? saved : clip) }));
    setSelectedClip(saved);
    if (next) {
      const index = clips?.items.findIndex((clip) => clip.id === saved.id) ?? -1;
      const following = clips?.items.slice(index + 1).find((clip) => clip.id !== saved.id);
      const earlier = clips?.items.find((clip) => clip.id !== saved.id);
      const candidate = following ?? (filter === "pending" ? earlier : undefined);
      setSelectedClip(candidate ?? null);
      if (!candidate && clips && page * clips.pageSize < clips.total && filter !== "pending") setPage((value) => value + 1);
    }
    setRefresh((value) => value + 1);
  };

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    setActionError("");
    try {
      const result = await retryAnnotationRecordings(settings, sessionId);
      if (!mounted.current) return;
      setNotice(`${result.retried} failed recording${result.retried === 1 ? "" : "s"} queued for another attempt.`);
      savingVersion.current++;
      setRefresh((value) => value + 1);
    } catch (reason) { if (mounted.current) setActionError(reportError(reason)); }
    finally { if (mounted.current) setRetrying(false); }
  };

  const drafts = [...workspace.drafts.values()].filter((draft) => draft.sessionId === sessionId);
  const counts = session ? annotationSessionCounts(session) : null;
  const exportBlocker = session ? annotationExportBlocker(session, drafts.length > 0) : "Load the session before exporting.";

  const download = async () => {
    if (!session || exportBlocker || loading || exporting || editorBusy) return;
    setExporting(true);
    setActionError("");
    try {
      // Recheck local edits immediately before making the request.
      if ([...workspace.drafts.values()].some((draft) => draft.sessionId === session.id)) return;
      const result = await exportAnnotationDataset(settings, session.id);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      document.body.append(link);
      link.click();
      link.remove();
      // Let the browser start the download before releasing the object URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (mounted.current) setNotice("Dataset ZIP downloaded: verified WAV/TXT pairs, manifest.jsonl, and README.txt. Rejected clips are excluded.");
    } catch (reason) { if (mounted.current) setActionError(reportError(reason)); }
    finally { if (mounted.current) setExporting(false); }
  };

  return <section className="panel dataset-studio">
    <div className="dataset-heading-row dataset-page-heading">
      <div className="section-heading"><p className="eyebrow">Human-verified speech data</p><h1>Dataset Studio</h1><p>Create a session, review the audio, and export a verified training dataset.</p></div>
      {!creating && !sessionId && <button type="button" onClick={() => setCreating(true)}>Create session</button>}
      {!creating && sessionId && <button className="secondary-button" type="button" onClick={() => openSession("")}>All sessions</button>}
    </div>
    {creating ? <DatasetCreateSession settings={settings} onUnauthorized={onUnauthorized} onCancel={() => setCreating(false)} onCreated={openSession} /> : <>
      {error && <div className="form-message error-message" role="alert">{error} <button className="secondary-button small-button" type="button" onClick={() => setRefresh((value) => value + 1)}>Refresh Dataset Studio</button></div>}
      {actionError && <div className="form-message error-message" role="alert">{actionError}</div>}
      {notice && <p className="dataset-notice" role="status">{notice}</p>}
      {!sessionId ? <>
        {workspace.drafts.size > 0 && <p className="dataset-notice" role="status">{workspace.drafts.size} unsaved clip draft{workspace.drafts.size === 1 ? " is" : "s are"} retained in this workspace. Reopen the session to continue.</p>}
        {loading ? <div className="empty-state" role="status">Loading annotation sessions…</div> : !error && !sessions.length ? <div className="dataset-card empty-state"><h2>Your first dataset starts here</h2><p>Select recordings, transcribe them, then listen and correct each clip before export.</p><button type="button" onClick={() => setCreating(true)}>Create your first session</button></div> : <div className="dataset-session-list">
          <p className="dataset-muted">Latest {sessions.length} permitted sessions (up to 100).</p>
          {sessions.map((item) => {
            const dirtyCount = [...workspace.drafts.values()].filter((draft) => draft.sessionId === item.id).length;
            const completed = item.recordings > 0 && item.readyRecordings === item.recordings && item.clips > 0 && item.verified + item.rejected === item.clips;
            return <article key={item.id} className="dataset-card">
              <div className="dataset-heading-row"><div><h2 data-i18n-skip>{item.name}</h2><p className="dataset-muted">{item.provider.toUpperCase()} · <span data-i18n-skip>{item.model || "Provider default"}</span> · {item.language.toUpperCase()} · {new Date(item.createdAt).toLocaleDateString(getIntlLocale())}</p></div><span className={`dataset-status dataset-status-${completed ? "verified" : "pending"}`}>{completed ? "Review complete" : item.failedRecordings ? "Needs attention" : item.readyRecordings < item.recordings ? "Transcribing" : "Needs review"}</span></div>
              <div className="dataset-stats"><span><strong>{item.recordings}</strong> recordings</span><span><strong>{item.clips}</strong> clips</span><span><strong>{item.verified}</strong> verified</span><span><strong>{item.rejected}</strong> rejected</span></div>
              <label className="dataset-progress-label">{item.readyRecordings} / {item.recordings} recordings ready<progress value={item.readyRecordings} max={Math.max(1, item.recordings)} /></label>
              <div className="dataset-heading-row"><p className="dataset-muted">{item.failedRecordings ? `${item.failedRecordings} recording(s) failed. ` : ""}{dirtyCount ? `${dirtyCount} unsaved draft(s).` : ""}</p><button type="button" className="secondary-button" onClick={() => openSession(item.id)}>Open session</button></div>
            </article>;
          })}
        </div>}
      </> : !session ? (loading && <div className="empty-state" role="status">Loading session and review queue…</div>) : <>
        <section className="dataset-card" aria-label="Session progress">
          <div className="dataset-heading-row"><div><h2 data-i18n-skip>{session.name}</h2><p className="dataset-muted">{session.provider.toUpperCase()} · <span data-i18n-skip>{session.model || "Provider default"}</span> · {session.language.toUpperCase()} · Target {session.minClipSeconds}–{session.maxClipSeconds}s</p></div>
            <button type="button" disabled={Boolean(exportBlocker) || exporting || loading || retrying || editorBusy} aria-describedby="dataset-export-help" onClick={() => void download()}>{exporting ? "Preparing ZIP…" : "Export dataset ZIP"}</button></div>
          <p id="dataset-export-help" className="dataset-muted">{exportBlocker || "Ready to export verified WAV/TXT pairs, manifest.jsonl, and README.txt. Rejected clips are excluded."}</p>
          <div className="dataset-stats"><span><strong>{counts!.ready} / {session.recordings.length}</strong> recordings ready</span><span><strong>{counts!.clips}</strong> clips</span><span><strong>{counts!.verified}</strong> verified</span><span><strong>{counts!.rejected}</strong> rejected</span><span><strong>{Math.max(0, counts!.clips - counts!.verified - counts!.rejected)}</strong> need review</span></div>
          <progress aria-label="Transcription progress" value={counts!.ready} max={Math.max(1, session.recordings.length)} />
          {counts!.active > 0 && <p role="status" className="dataset-muted">Transcribing {counts!.active} recording(s). Progress refreshes every five seconds while this page is visible. Ready clips can already be reviewed.</p>}
          {counts!.failed > 0 && <div className="dataset-notice dataset-warning"><p>{counts!.failed} recording(s) failed. Review the errors below and retry.</p><button className="secondary-button" type="button" disabled={retrying} onClick={() => void retry()}>{retrying ? "Retrying…" : "Retry failed recordings"}</button></div>}
          <details className="dataset-recordings" open={counts!.failed > 0}><summary>Recordings and transcription status ({session.recordings.length})</summary><ul>{session.recordings.map((recording) => <li key={recording.id}><strong>{recording.name}</strong> <span className={`dataset-status dataset-status-${recording.status}`}>{recording.status}</span><small>{recording.clips} clips · {recording.verified} verified · {recording.rejected} rejected</small>{recording.error && <p className="dataset-error">{recording.error}</p>}</li>)}</ul></details>
        </section>
        <div className="dataset-review-layout">
          <aside className="dataset-card dataset-queue" aria-label="Clip review queue">
            <div className="dataset-heading-row"><h2>Review queue</h2><button type="button" className="secondary-button small-button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh clips</button></div>
            <label>Clip filter<select value={filter} onChange={(event) => { setFilter(event.target.value as AnnotationFilter); setPage(1); setClips(null); setSelectedClip(null); }}>{filters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            {drafts.length > 0 && <details className="dataset-unsaved" open><summary>Unsaved edits ({drafts.length})</summary>{drafts.map((draft) => <button className="secondary-button small-button" key={draft.clip.id} type="button" onClick={() => setSelectedClip(draft.clip)}>{draft.clip.recordingName} · Clip {draft.clip.index}</button>)}</details>}
            <div className="dataset-queue-items" aria-busy={loading}>
              {!clips ? <p role="status">Loading clips…</p> : !clips.items.length ? <div className="empty-state"><h3>{counts!.active ? "Clips are being prepared" : "Queue is clear"}</h3><p>{counts!.active ? "Clips appear here as recordings finish transcription." : "No clips match this filter. Choose another filter to inspect reviewed clips."}</p></div> : clips.items.map((clip) => {
                const duration = clip.endSeconds - clip.startSeconds;
                return <button className={`dataset-queue-item ${selectedClip?.id === clip.id ? "is-active" : ""}`} type="button" key={clip.id} aria-label={`${clip.recordingName}, clip ${clip.index}, ${clip.status === "pending" ? "Needs review" : clip.status}`} aria-pressed={selectedClip?.id === clip.id} onClick={() => setSelectedClip(clip)}>
                  <span className="dataset-heading-row"><strong>Clip {clip.index}</strong><span className={`dataset-status dataset-status-${clip.status}`}>{clip.status === "pending" ? "Needs review" : clip.status}</span></span>
                  <span className="dataset-clip-name" data-i18n-skip>{clip.recordingName}</span><small>{formatClipTime(clip.startSeconds)} – {formatClipTime(clip.endSeconds)} · {duration.toFixed(2)}s</small>
                  {(duration < session.minClipSeconds || duration > session.maxClipSeconds) && <small className="dataset-warning">Outside duration target</small>}
                  {workspace.drafts.has(clip.id) && <small className="dataset-listened">Unsaved edits</small>}
                </button>;
              })}
            </div>
            <div className="dataset-pagination" aria-label="Clip pages"><button type="button" className="secondary-button small-button" disabled={loading || page <= 1} onClick={() => { setPage((value) => value - 1); setClips(null); setSelectedClip(null); }}>Previous clips</button><span>{page} / {Math.max(1, Math.ceil((clips?.total ?? 0) / (clips?.pageSize || 50)))}</span><button type="button" className="secondary-button small-button" disabled={loading || !clips || page * clips.pageSize >= clips.total} onClick={() => { setPage((value) => value + 1); setClips(null); setSelectedClip(null); }}>Next clips</button></div>
          </aside>
          {selectedClip ? <DatasetClipEditor key={selectedClip.id} settings={settings} session={session}
            initialDraft={workspace.drafts.get(selectedClip.id) ?? createAnnotationDraft(session.id, selectedClip)}
            remoteRevision={clips?.items.find((clip) => clip.id === selectedClip.id)?.revision}
            onDraft={updateDraft} onSaved={clipSaved} onBusyChange={setEditorBusy} onUnauthorized={onUnauthorized} /> : <div className="dataset-card empty-state"><h2>Select a clip to review</h2><p>Listen to the full preview, correct the transcript, then verify or reject the clip.</p></div>}
        </div>
      </>}
    </>}
  </section>;
}
