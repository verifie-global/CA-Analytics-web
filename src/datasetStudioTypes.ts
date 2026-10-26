import type { SttProvider } from "./types";

export type AnnotationStatus = "pending" | "verified" | "rejected";
export type AnnotationFilter = AnnotationStatus | "all";
export type AnnotationPage<T> = { items: T[]; total: number; page: number; pageSize: number };
export type AnnotationSource = {
  id: number;
  name: string;
  companyId: number | string;
  companyName: string | null;
  createdAt: string;
  durationSeconds: number | null;
};
export type AnnotationSourceCompany = { id: number; name: string; recordings: number };
export type AnnotationSourceFilters = {
  q: string;
  sourceCompanyId: number | null;
  createdFrom: string | null;
  createdTo: string | null;
};
export type AnnotationSourceSelectionInput = AnnotationSourceFilters & {
  limit: number;
  excludeConversationIds: number[];
};
export type AnnotationSourceSelection = {
  conversationIds: number[];
  totalMatching: number;
  totalAvailable: number;
  selected: number;
  truncated: boolean;
  limit: number;
};
export type AnnotationProviderOptions = {
  provider: SttProvider;
  models: string[];
  defaultModel: string | null;
};
export type AnnotationOptions = { providers: AnnotationProviderOptions[] };
export type AnnotationTranscriptionSettings = { provider: SttProvider; model: string | null };
export type AnnotationSessionSummary = {
  id: string;
  name: string;
  provider: SttProvider;
  model: string | null;
  language: string;
  createdAt: string;
  recordings: number;
  readyRecordings: number;
  failedRecordings: number;
  clips: number;
  verified: number;
  rejected: number;
};
export type AnnotationRecording = {
  id: string;
  conversationId: number;
  name: string;
  companyId: number | string;
  companyName: string | null;
  status: "pending" | "transcribing" | "ready" | "failed";
  error: string | null;
  durationSeconds: number | null;
  originalTranscript: string | null;
  clips: number;
  verified: number;
  rejected: number;
};
export type AnnotationSession = Omit<AnnotationSessionSummary,
  "recordings" | "readyRecordings" | "failedRecordings" | "clips" | "verified" | "rejected"> & {
  minClipSeconds: number;
  maxClipSeconds: number;
  recordings: AnnotationRecording[];
};
export type CreateAnnotationSession = {
  name: string;
  conversationIds: number[];
  provider: SttProvider;
  model: string | null;
  language: "auto" | "hy" | "en" | "ru";
  minClipSeconds: number;
  maxClipSeconds: number;
};
export type AnnotationClip = {
  id: string;
  recordingId: string;
  index: number;
  startSeconds: number;
  endSeconds: number;
  originalText: string;
  text: string;
  status: AnnotationStatus;
  note: string | null;
  revision: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  recordingDuration: number | null;
  recordingName: string;
  sourceCompanyId: number | string;
  sourceCompanyName: string | null;
  boundaryMethod: string | null;
  boundaryReviewRequired: boolean;
  boundariesConfirmed: boolean;
};
export type SaveAnnotationClip = {
  text: string;
  status: AnnotationStatus;
  revision: string;
  startSeconds: number;
  endSeconds: number;
  note: string | null;
  confirmedCorrect: boolean;
  confirmedBoundaries: boolean;
};
export type AnnotationSaveResult = {
  revision: string;
  status: AnnotationStatus;
  reviewedAt: string | null;
} & Partial<Pick<AnnotationClip, "boundaryMethod" | "boundaryReviewRequired" | "boundariesConfirmed">>;

export type AnnotationDraft = {
  sessionId: string;
  clip: AnnotationClip;
  text: string;
  note: string;
  start: string;
  end: string;
};

// Owned by App so drafts survive navigation without persisting speech data to disk.
export type DatasetWorkspace = {
  sessionId: string;
  drafts: Map<string, AnnotationDraft>;
  controller: AbortController;
  revoked: boolean;
};
export const createDatasetWorkspace = (): DatasetWorkspace => ({
  sessionId: "", drafts: new Map(), controller: new AbortController(), revoked: false,
});

export function clearDatasetWorkspace(workspace: DatasetWorkspace) {
  workspace.revoked = true;
  workspace.controller.abort();
  workspace.drafts.clear();
  workspace.sessionId = "";
}

export type DatasetStudioIdentity = { companyId: string | null; userId: string | null };
