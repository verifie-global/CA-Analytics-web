import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCallDetail, fetchCalls, uploadCall } from "./api";
import type { AppSettings, CallFilters } from "./types";

const settings: AppSettings = {
  baseUrl: "https://api.example.test/",
  companyId: "123",
  apiToken: "",
  accessToken: "jwt-token",
};

const filters: CallFilters = {
  page: 1,
  pageSize: 25,
  search: "",
  conversationId: "",
  createdFromUtc: "",
  createdToUtc: "",
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("call display metadata", () => {
  it("normalizes conversation and original audio names in call-list results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                conversationId: "call-123",
                conversationName: "Customer renewal call",
                originalAudioFileName: "renewal.wav",
                status: "Completed",
                modality: "text",
                textConnectorAccountId: "connector-1",
                sourceProvider: "chat2desk",
                sourceChannel: "Telegram",
                externalSourceConversationId: "external-99",
                textLastMessageAt: "2026-09-01T10:00:00Z",
              },
            ],
            page: 1,
            pageSize: 25,
            total: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await fetchCalls(settings, filters);

    expect(result.items[0]).toMatchObject({
      conversationId: "call-123",
      conversationName: "Customer renewal call",
      originalAudioFileName: "renewal.wav",
      modality: "text",
      textConnectorAccountId: "connector-1",
      sourceProvider: "chat2desk",
      sourceChannel: "Telegram",
      externalSourceConversationId: "external-99",
    });
  });

  it("normalizes detail metadata while requesting the detail by conversation ID", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          conversationId: "call-456",
          conversationName: "Billing follow-up",
          originalAudioFileName: "billing-follow-up.mp3",
          status: "Completed",
          modality: "text",
          textFinalizedAt: "2026-09-01T10:05:00Z",
          textFinalizationReason: "manual",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const detail = await fetchCallDetail(settings, "call-456");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/companies/123/calls/call-456",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer jwt-token",
        }),
      }),
    );
    expect(detail).toMatchObject({
      conversationId: "call-456",
      conversationName: "Billing follow-up",
      originalAudioFileName: "billing-follow-up.mp3",
      modality: "text",
      textFinalizedAt: "2026-09-01T10:05:00Z",
      textFinalizationReason: "manual",
    });
  });

  it("returns upload display metadata while keeping the route keyed by conversation ID", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          conversationId: "call-42",
          conversationName: "call-42",
          originalAudioFileName: "customer-recording.mp3",
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadCall(settings, {
      conversationId: "call-42",
      url: "",
      file: new File(["audio"], "customer-recording.mp3", {
        type: "audio/mpeg",
      }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/companies/123/calls/call-42",
      expect.objectContaining({ method: "POST" }),
    );
    const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(request.headers).toEqual({ Authorization: "Bearer jwt-token" });
    expect((request.body as FormData).get("audio")).toBeInstanceOf(File);
    expect((request.body as FormData).has("url")).toBe(false);
    expect((request.body as FormData).has("transcript")).toBe(false);
    expect(result).toMatchObject({
      conversationId: "call-42",
      conversationName: "call-42",
      originalAudioFileName: "customer-recording.mp3",
      status: "Queued",
      source: "audio",
    });
  });
});
