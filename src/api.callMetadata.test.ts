import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCallDetail, fetchCalls } from "./api";
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
    });
  });
});
