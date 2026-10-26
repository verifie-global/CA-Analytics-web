import type { AnnotationClip, AnnotationDraft, AnnotationSession } from "./datasetStudioTypes";

export const createAnnotationDraft = (sessionId: string, clip: AnnotationClip): AnnotationDraft => ({
  sessionId, clip, text: clip.text ?? "", note: clip.note ?? "",
  start: String(clip.startSeconds), end: String(clip.endSeconds),
});

export const isAnnotationDraftDirty = (draft: AnnotationDraft) =>
  draft.text !== (draft.clip.text ?? "") || draft.note !== (draft.clip.note ?? "") ||
  Number(draft.start) !== draft.clip.startSeconds || Number(draft.end) !== draft.clip.endSeconds ||
  !draft.start.trim() || !draft.end.trim();

export function annotationBoundaryError(start: string, end: string, recordingDuration: number | null) {
  const from = Number(start);
  const to = Number(end);
  if (!start.trim() || !end.trim() || !Number.isFinite(from) || !Number.isFinite(to)) return "Enter valid start and end times.";
  if (from < 0 || to <= from) return "End must be after start, and start must be zero or greater.";
  if (recordingDuration !== null && to > recordingDuration) return "The preview must stay inside the recording.";
  if (to - from > 60) return "An audio preview can span at most 60 seconds.";
  return "";
}

// HTMLMediaElement.played contains only intervals actually played by the browser;
// currentTime and the ended event alone also include skipped/seeked audio.
export function hasListenedToPreview(played: TimeRanges, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0 || played.length === 0) return false;
  let through = 0;
  const tolerance = 0.025;
  for (let index = 0; index < played.length; index++) {
    if (played.start(index) > through + tolerance) return false;
    through = Math.max(through, played.end(index));
    if (through >= duration - tolerance) return true;
  }
  return false;
}

export function annotationSessionCounts(session: AnnotationSession) {
  return session.recordings.reduce((counts, recording) => ({
    ...counts,
    ready: counts.ready + Number(recording.status === "ready"),
    failed: counts.failed + Number(recording.status === "failed"),
    active: counts.active + Number(recording.status === "pending" || recording.status === "transcribing"),
    clips: counts.clips + recording.clips,
    verified: counts.verified + recording.verified,
    rejected: counts.rejected + recording.rejected,
  }), { ready: 0, failed: 0, active: 0, clips: 0, verified: 0, rejected: 0 });
}

export function annotationExportBlocker(session: AnnotationSession, dirty: boolean) {
  const counts = annotationSessionCounts(session);
  if (dirty) return "Save or discard all unsaved edits in this session before exporting.";
  if (!session.recordings.length || counts.ready !== session.recordings.length) return "Every recording must be ready before exporting. Resolve transcription errors first.";
  if (counts.verified + counts.rejected !== counts.clips) return "Verify or reject every clip before exporting.";
  if (!counts.verified) return "Verify at least one clip before exporting.";
  return "";
}

export const formatClipTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
};
