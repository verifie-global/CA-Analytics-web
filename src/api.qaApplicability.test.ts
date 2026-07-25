import { afterEach, describe, expect, it, vi } from "vitest";
import { updateQaApplicability } from "./api";

const settings = {
  baseUrl: "https://api.example.test/",
  companyId: "123",
  apiToken: "",
  accessToken: "jwt-token",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("updateQaApplicability", () => {
  it("sends the exclusion request and normalizes response.qa", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          companyId: 123,
          conversationId: "external-call-id",
          qa: {
            isApplicable: false,
            status: "not_applicable",
            notApplicableReason: "Internal test call",
            qaScore: null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const qa = await updateQaApplicability(
      settings,
      "external-call-id",
      false,
      "  Internal test call  ",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/companies/123/calls/external-call-id/qa-applicability",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          Authorization: "Bearer jwt-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          isApplicable: false,
          reason: "Internal test call",
        }),
      }),
    );
    expect(qa).toMatchObject({
      isApplicable: false,
      status: "not_applicable",
      notApplicableReason: "Internal test call",
      score: null,
    });
  });

  it("sends only isApplicable when restoring", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          qa: {
            isApplicable: true,
            status: "pending",
            notApplicableReason: null,
            qaScore: null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const qa = await updateQaApplicability(settings, "call-2", true, "ignored");

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      isApplicable: true,
    });
    expect(qa).toMatchObject({ isApplicable: true, status: "pending", score: null });
  });

  it("uses the first reason validation error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            message: "Validation failed.",
            errors: {
              reason: [
                "A reason is required when marking a conversation as not applicable for QA.",
                "Another reason error.",
              ],
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(
      updateQaApplicability(settings, "call-3", false, ""),
    ).rejects.toMatchObject({
      message: "A reason is required when marking a conversation as not applicable for QA.",
      status: 400,
    });
  });

  it.each([401, 403, 404])("preserves HTTP status %s for UI handling", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ message: "Request failed." }), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      updateQaApplicability(settings, "missing", true),
    ).rejects.toMatchObject({ status });
  });
});
