import { describe, expect, it } from "vitest";
import {
  MAX_TRANSCRIPT_LENGTH,
  createCallUploadDraft,
  selectCallInputSource,
  validateCallUploadDraft,
} from "./callUpload";

describe("call upload form validation", () => {
  it("defaults optional STT overrides to the company policy", () => {
    expect(createCallUploadDraft("call-1")).toMatchObject({
      language: "",
      enhancement: "",
    });
  });

  it("accepts unlabeled transcript messages", () => {
    const draft = {
      ...createCallUploadDraft("chat-1"),
      source: "transcript" as const,
      transcript: "Hello, I need help.\nI will check your account.",
    };

    expect(validateCallUploadDraft(draft)).toBeNull();
  });

  it("enforces the transcript character limit", () => {
    const draft = {
      ...createCallUploadDraft("chat-1"),
      source: "transcript" as const,
      transcript: "x".repeat(MAX_TRANSCRIPT_LENGTH + 1),
    };

    expect(validateCallUploadDraft(draft)).toContain("250,000");
  });

  it("clears inactive values when the mutually exclusive source changes", () => {
    const file = new File(["audio"], "call.mp3", { type: "audio/mpeg" });
    const draft = {
      ...createCallUploadDraft("chat-1"),
      files: [file],
      url: "https://example.test/call.mp3",
      transcript: "Hello",
    };

    expect(selectCallInputSource(draft, "transcript")).toMatchObject({
      source: "transcript",
      files: [],
      url: "",
      transcript: "",
    });
  });

  it("rejects multiple sources and invalid bill seconds", () => {
    const multipleSources = {
      ...createCallUploadDraft("chat-1"),
      source: "transcript" as const,
      transcript: "Hello",
      url: "https://example.test/call.mp3",
    };
    const invalidBillSeconds = {
      ...createCallUploadDraft("chat-1"),
      source: "transcript" as const,
      transcript: "Hello",
      billSeconds: "1.5",
    };

    expect(validateCallUploadDraft(multipleSources)).toContain("exactly one");
    expect(validateCallUploadDraft(invalidBillSeconds)).toContain("whole number");
  });
});
