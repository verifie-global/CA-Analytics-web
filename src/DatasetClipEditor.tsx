import { useEffect, useRef, useState } from "react";
import { fetchAnnotationAudio, fetchAnnotationClips, saveAnnotationClip } from "./api";
import type { RequestError } from "./api";
import type { AppSettings } from "./types";
import type { AnnotationClip, AnnotationDraft, AnnotationSession, AnnotationStatus } from "./datasetStudioTypes";
import { annotationBoundaryError, createAnnotationDraft, formatClipTime, hasListenedToPreview, isAnnotationDraftDirty } from "./datasetStudioModel";

type AudioProps = {
  settings: AppSettings;
  sessionId: string;
  clipId: string;
  start: number;
  end: number;
  onListened: (value: boolean) => void;
  onUnauthorized: () => void;
};

function ClipAudioPreview({ settings, sessionId, clipId, start, end, onListened, onUnauthorized }: AudioProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [peaks, setPeaks] = useState<number[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const callbacks = useRef({ onListened, onUnauthorized });
  callbacks.current = { onListened, onUnauthorized };

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
    };
  }, [url, error]);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    let decoder: AudioContext | undefined;
    setUrl("");
    setError("");
    setPeaks([]);
    callbacks.current.onListened(false);
    void fetchAnnotationAudio(settings, sessionId, clipId, start, end, controller.signal).then(async (blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      // A waveform is optional: audio still works if decoding is unsupported.
      if (typeof AudioContext === "undefined") return;
      try {
        decoder = new AudioContext();
        const buffer = await decoder.decodeAudioData(await blob.arrayBuffer());
        if (controller.signal.aborted) return;
        const samples = buffer.getChannelData(0);
        const values = Array.from({ length: 100 }, (_, index) => {
          const from = Math.floor(index * samples.length / 100);
          const to = Math.floor((index + 1) * samples.length / 100);
          let peak = 0;
          for (let offset = from; offset < to; offset++) peak = Math.max(peak, Math.abs(samples[offset]));
          return peak;
        });
        const maximum = Math.max(...values, 0.01);
        setPeaks(values.map((peak) => peak / maximum));
      } catch { /* The native player remains available. */ }
      finally { if (decoder?.state !== "closed") void decoder?.close().catch(() => undefined); }
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      if ((reason as RequestError).status === 401) callbacks.current.onUnauthorized();
      setError(reason instanceof Error ? reason.message : "Unable to prepare audio.");
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (decoder && decoder.state !== "closed") void decoder.close().catch(() => undefined);
    };
  }, [settings.baseUrl, settings.companyId, settings.accessToken, sessionId, clipId, start, end, attempt]);

  const checkPlayback = () => {
    const audio = audioRef.current;
    if (audio && hasListenedToPreview(audio.played, audio.duration)) callbacks.current.onListened(true);
  };

  return <div className="dataset-audio">
    {error ? <div className="form-message error-message" role="alert">{error}
      <button className="secondary-button small-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Retry audio</button>
    </div> : !url ? <p role="status">Preparing authenticated audio preview…</p> : <>
      {peaks.length > 0 && <svg className="dataset-waveform" viewBox="0 0 400 64" role="img" aria-label="Audio waveform">
        {peaks.map((peak, index) => <line key={index} x1={index * 4 + 2} x2={index * 4 + 2} y1={32 - Math.max(1, peak * 29)} y2={32 + Math.max(1, peak * 29)} />)}
      </svg>}
      <audio ref={audioRef} aria-label="Clip audio preview" controls src={url} preload="auto"
        onTimeUpdate={checkPlayback} onEnded={checkPlayback} onPause={checkPlayback}
        onLoadedMetadata={() => { if (audioRef.current) audioRef.current.playbackRate = speed; }}
        onError={() => { callbacks.current.onListened(false); setError("The audio could not be played. Prepare the preview again."); }} />
      <label className="dataset-speed">Playback speed
        <select value={speed} onChange={(event) => {
          const rate = Number(event.target.value);
          setSpeed(rate);
          if (audioRef.current) audioRef.current.playbackRate = rate;
        }}>{[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}</select>
      </label>
    </>}
  </div>;
}

type Props = {
  settings: AppSettings;
  session: AnnotationSession;
  initialDraft: AnnotationDraft;
  remoteRevision?: string;
  onDraft: (draft: AnnotationDraft, discard?: boolean) => void;
  onSaved: (clip: AnnotationClip, next: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onUnauthorized: () => void;
};

export function DatasetClipEditor({ settings, session, initialDraft, remoteRevision, onDraft, onSaved, onBusyChange, onUnauthorized }: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const [preview, setPreview] = useState<{ start: number; end: number; version: number } | null>(() =>
    annotationBoundaryError(initialDraft.start, initialDraft.end, initialDraft.clip.recordingDuration) ? null : {
      start: Number(initialDraft.start), end: Number(initialDraft.end), version: 0,
    });
  const [listened, setListened] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => {
    busyCallback.current(saving || reloading);
    return () => busyCallback.current(false);
  }, [saving, reloading]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const clip = draft.clip;
  const dirty = isAnnotationDraftDirty(draft);
  const boundaryError = annotationBoundaryError(draft.start, draft.end, clip.recordingDuration);
  const duration = Number(draft.end) - Number(draft.start);
  const outsideTarget = !boundaryError && (duration < session.minClipSeconds || duration > session.maxClipSeconds);
  const remoteChanged = Boolean(remoteRevision && remoteRevision !== clip.revision);
  const hasConflict = conflict || remoteChanged;
  const invalid = Boolean(boundaryError) || draft.text.length > 20000 || draft.note.length > 2000;

  const update = (change: Partial<AnnotationDraft>) => {
    const next = { ...draft, ...change };
    setDraft(next);
    onDraft(next);
    setMessage("");
    setConfirmed(false);
    if ("start" in change || "end" in change) {
      setPreview(null);
      setListened(false);
    }
  };

  const save = async (status: AnnotationStatus) => {
    if (saving || reloading || invalid || hasConflict || (status === "verified" && (!listened || !preview || !confirmed || !draft.text.trim()))) return;
    setSaving(true);
    setError("");
    try {
      const result = await saveAnnotationClip(settings, session.id, clip.id, {
        text: draft.text, status, revision: clip.revision,
        startSeconds: Number(draft.start), endSeconds: Number(draft.end), note: draft.note || null,
        confirmedCorrect: status === "verified",
      });
      const saved: AnnotationClip = { ...clip, ...result, text: draft.text,
        startSeconds: Number(draft.start), endSeconds: Number(draft.end), note: draft.note || null };
      // Notify the workspace even if navigation unmounted the editor during the request.
      onDraft(createAnnotationDraft(session.id, saved));
      if (!mounted.current) return;
      setDraft(createAnnotationDraft(session.id, saved));
      setMessage(status === "pending" ? "Draft saved. Verification has been cleared." : status === "verified" ? "Clip verified." : "Clip rejected.");
      onSaved(saved, status === "verified");
    } catch (reason) {
      if (!mounted.current) return;
      if ((reason as RequestError).status === 401) onUnauthorized();
      if ((reason as RequestError).status === 409) setConflict(true);
      setError(reason instanceof Error ? reason.message : "Unable to save the clip.");
    } finally { if (mounted.current) setSaving(false); }
  };

  const reload = async () => {
    if (dirty && !window.confirm("Replace your local transcript, note, and boundaries with the latest saved version?")) return;
    setReloading(true);
    setError("");
    try {
      let page = 1;
      let latest: AnnotationClip | undefined;
      // The contract has no single-clip GET; search the unfiltered pages.
      while (!latest) {
        const result = await fetchAnnotationClips(settings, session.id, "all", page);
        latest = result.items.find((item) => item.id === clip.id);
        if (latest || !result.items.length || page * result.pageSize >= result.total) break;
        page++;
      }
      if (!mounted.current) return;
      if (!latest) throw new Error("This clip is no longer available. Your local edits are still retained.");
      const next = createAnnotationDraft(session.id, latest);
      setDraft(next);
      onDraft(next, true);
      setConflict(false);
      setListened(false);
      setConfirmed(false);
      setPreview({ start: latest.startSeconds, end: latest.endSeconds, version: Date.now() });
      setMessage("Latest saved version loaded. Listen to the preview again before verifying.");
      onSaved(latest, false);
    } catch (reason) {
      if (!mounted.current) return;
      if ((reason as RequestError).status === 401) onUnauthorized();
      setError(reason instanceof Error ? reason.message : "Unable to reload the clip.");
    } finally { if (mounted.current) setReloading(false); }
  };

  return <section className="dataset-editor dataset-card" aria-label="Focused clip editor" aria-busy={saving || reloading}>
    <div className="dataset-heading-row">
      <div><p className="eyebrow">Clip {clip.index}</p><h2 data-i18n-skip>{clip.recordingName}</h2></div>
      <span className={`dataset-status dataset-status-${clip.status}`}>{clip.status === "pending" ? "Needs review" : clip.status}</span>
    </div>
    <p className="dataset-muted">Source {formatClipTime(clip.startSeconds)} – {formatClipTime(clip.endSeconds)} · {(clip.endSeconds - clip.startSeconds).toFixed(2)}s</p>
    {dirty && <p className="dataset-notice" role="status">Unsaved edits are retained when you change clips or pages.</p>}
    {hasConflict && <div className="dataset-notice dataset-warning" role="alert">
      <strong>This clip has a conflicting saved version.</strong><p>Your local text and boundaries are retained. Reload the saved version to continue.</p>
      <button type="button" className="secondary-button" disabled={saving || reloading} onClick={() => void reload()}>Reload latest saved version</button>
    </div>}
    {error && <div className="form-message error-message" role="alert">{error}</div>}
    {message && <p role="status" className="dataset-notice">{message}</p>}
    <fieldset disabled={saving || reloading} className="dataset-fields">
      <legend>Audio boundaries</legend>
      <div className="dataset-form-grid">
        <label>Start (seconds)<input type="number" min="0" step="0.01" value={draft.start} aria-invalid={Boolean(boundaryError)} onChange={(event) => update({ start: event.target.value })} /></label>
        <label>End (seconds)<input type="number" min="0" max={clip.recordingDuration ?? undefined} step="0.01" value={draft.end} aria-invalid={Boolean(boundaryError)} onChange={(event) => update({ end: event.target.value })} /></label>
      </div>
      {boundaryError ? <p className="dataset-error" role="alert">{boundaryError}</p> : <p className="dataset-muted">Preview duration: {duration.toFixed(2)}s. Word boundaries take priority over the {session.minClipSeconds}–{session.maxClipSeconds}s target.</p>}
      {outsideTarget && <p className="dataset-warning">Outside the session duration target. Check the word boundaries.</p>}
      {!preview && <button className="secondary-button" type="button" disabled={Boolean(boundaryError)} onClick={() => {
        setListened(false); setConfirmed(false);
        setPreview({ start: Number(draft.start), end: Number(draft.end), version: Date.now() });
      }}>Prepare audio preview</button>}
    </fieldset>
    {preview && <ClipAudioPreview key={`${clip.id}/${preview.version}/${preview.start}/${preview.end}`} settings={settings}
      sessionId={session.id} clipId={clip.id} start={preview.start} end={preview.end} onListened={setListened} onUnauthorized={onUnauthorized} />}
    <p className={listened ? "dataset-listened" : "dataset-muted"} role="status">{listened ? "Complete preview listened to." : "Listen to the entire current preview to enable verification. Skipping audio does not count."}</p>
    <fieldset disabled={saving || reloading} className="dataset-fields">
      <legend>Review transcript</legend>
      <label>Corrected transcript<textarea data-i18n-skip dir="auto" lang={session.language === "auto" ? undefined : session.language} rows={7} maxLength={20000} value={draft.text} onChange={(event) => update({ text: event.target.value })} /></label>
      <small className="dataset-muted">{draft.text.length.toLocaleString()} / 20,000 characters</small>
      <details className="dataset-original" open><summary>Original transcription (read only)</summary><p data-i18n-skip dir="auto">{clip.originalText || "No original transcription."}</p></details>
      <label>Review note (optional)<textarea data-i18n-skip dir="auto" rows={2} maxLength={2000} value={draft.note} onChange={(event) => update({ note: event.target.value })} /></label>
      <small className="dataset-muted">{draft.note.length.toLocaleString()} / 2,000 characters</small>
      <label className="dataset-checkbox"><input type="checkbox" checked={confirmed} disabled={!listened || !preview} onChange={(event) => setConfirmed(event.target.checked)} />
        <span>I listened to the entire current preview and confirm the corrected transcript matches the audio.</span>
      </label>
    </fieldset>
    <div className="dataset-actions">
      <button type="button" className="secondary-button" disabled={saving || reloading || invalid || hasConflict} onClick={() => void save("pending")}>Save draft</button>
      <button type="button" className="dataset-reject" disabled={saving || reloading || invalid || hasConflict} onClick={() => void save("rejected")}>Reject clip</button>
      <button type="button" disabled={saving || reloading || invalid || hasConflict || !listened || !preview || !confirmed || !draft.text.trim()} onClick={() => void save("verified")}>{saving ? "Saving…" : "Verify & next"}</button>
    </div>
    {(dirty || hasConflict) && <button type="button" className="secondary-button small-button" disabled={saving || reloading} onClick={() => void reload()}>Discard edits and reload saved clip</button>}
  </section>;
}
