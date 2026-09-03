import type { CallEnhancementMode, CallUploadLanguage } from "./types";

export const MAX_TRANSCRIPT_LENGTH = 250_000;

export type CallInputSource = "audio-file" | "audio-url" | "transcript";

export type CallUploadDraft = {
  conversationId: string;
  source: CallInputSource;
  url: string;
  files: File[];
  transcript: string;
  language: CallUploadLanguage;
  enhancement: CallEnhancementMode;
  agentName: string;
  agentExternalId: string;
  agentPhone: string;
  customerName: string;
  customerExternalId: string;
  customerPhone: string;
  isInbound: "" | "true" | "false";
  billSeconds: string;
};

export const createCallUploadDraft = (
  conversationId: string,
  defaults: { language?: string; enhancement?: CallEnhancementMode } = {},
): CallUploadDraft => ({
  conversationId,
  source: "audio-file",
  url: "",
  files: [],
  transcript: "",
  language: defaults.language?.trim() ?? "",
  enhancement: defaults.enhancement ?? "",
  agentName: "",
  agentExternalId: "",
  agentPhone: "",
  customerName: "",
  customerExternalId: "",
  customerPhone: "",
  isInbound: "",
  billSeconds: "",
});

export const selectCallInputSource = (
  draft: CallUploadDraft,
  source: CallInputSource,
): CallUploadDraft => ({
  ...draft,
  source,
  url: "",
  files: [],
  transcript: "",
});

export const validateCallUploadDraft = (draft: CallUploadDraft): string | null => {
  if (!draft.conversationId.trim()) {
    return "Conversation ID is required.";
  }

  const populatedSourceCount = [
    draft.files.length > 0,
    Boolean(draft.url.trim()),
    Boolean(draft.transcript.trim()),
  ].filter(Boolean).length;

  if (populatedSourceCount > 1) {
    return "Choose exactly one input source: audio file, audio URL, or transcript/chat text.";
  }

  if (draft.source === "audio-file" && draft.files.length === 0) {
    return "Select one or more local audio or MOV files.";
  }

  if (draft.source === "audio-url" && !draft.url.trim()) {
    return "Enter an audio URL.";
  }

  if (draft.source === "transcript") {
    if (!draft.transcript.trim()) {
      return "Enter transcript or chat text.";
    }

    if (draft.transcript.length > MAX_TRANSCRIPT_LENGTH) {
      return `Transcript/chat text cannot exceed ${MAX_TRANSCRIPT_LENGTH.toLocaleString("en-US")} characters.`;
    }
  }

  if (populatedSourceCount !== 1) {
    return "Provide exactly one audio file, audio URL, or transcript/chat text source.";
  }

  if (draft.billSeconds.trim()) {
    const billSeconds = Number(draft.billSeconds);
    if (!Number.isInteger(billSeconds) || billSeconds < 0) {
      return "Bill seconds must be a non-negative whole number.";
    }
  }

  return null;
};
