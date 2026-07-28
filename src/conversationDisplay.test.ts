import { describe, expect, it } from "vitest";
import { getConversationDisplayName } from "./conversationDisplay";

describe("conversation display names", () => {
  it("includes the original filename after a conversation name", () => {
    expect(
      getConversationDisplayName({
        conversationId: "conversation-42",
        conversationName: "call-42",
        originalAudioFileName: "customer-recording.mp3",
      }),
    ).toBe("call-42 — customer-recording.mp3");
  });

  it("falls back from conversation name to filename and then ID", () => {
    expect(
      getConversationDisplayName({
        conversationId: "conversation-42",
        originalAudioFileName: "customer-recording.mp3",
      }),
    ).toBe("customer-recording.mp3");
    expect(
      getConversationDisplayName({ conversationId: "conversation-42" }),
    ).toBe("conversation-42");
  });
});
