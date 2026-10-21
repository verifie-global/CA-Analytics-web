import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCallDetail,
  fetchQaProfile,
  fetchQaScoringSettings,
  saveQaProfile,
  saveQaScoringSettings,
  updateQaApplicability,
  updateQaScore,
} from "./api";
import { createSectionQaResult } from "./qaSectionScoring.testFixtures";

const settings = {
  baseUrl: "https://api.example.test/",
  companyId: "123",
  apiToken: "",
  accessToken: "jwt-token",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("section QA evaluation metadata", () => {
  it("preserves stored scoring settings, section weights, and question applicability in call details", async () => {
    const qa = createSectionQaResult();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ conversationId: "section-call", qa }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    const detail = await fetchCallDetail(settings, "section-call");

    expect(detail.qa).toMatchObject(qa);
    expect(detail.qa?.evaluation?.questionResults.filter((question) => question.isApplicable === false)).toHaveLength(7);
  });

  it("retains exclusion flags in manual corrections and the returned evaluation", async () => {
    const qa = createSectionQaResult();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify({ qa }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const corrections = [{
      id: "a4",
      score: 0 as const,
      isApplicable: false,
      reason: "No transfer was requested.",
    }];

    const updated = await updateQaScore(settings, "section-call", "Clarified the exclusion.", corrections);

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      reason: "Clarified the exclusion.",
      questionResults: corrections,
    });
    expect(updated).toMatchObject(qa);
  });
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

describe("QA scoring settings", () => {
  it("normalizes the maximum score returned by the settings endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            companyId: 123,
            isConfigured: true,
            isEnabled: true,
            qaScoreMaximum: 120,
            qaScoringMode: "subtract_failed_weights",
            minScorableCallDurationSeconds: null,
            repeatContactAutoPassEnabled: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchQaScoringSettings(settings)).resolves.toMatchObject({
      companyId: 123,
      qaScoreMaximum: 120,
      qaScoringMode: "subtract_failed_weights",
      minScorableCallDurationSeconds: null,
      repeatContactAutoPassEnabled: false,
    });
  });

  it("includes all editable settings in the PUT payload", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const saved = await saveQaScoringSettings(settings, {
      qaScoreMaximum: 120,
      qaScoringMode: "subtract_failed_weights",
      minScorableCallDurationSeconds: null,
      repeatContactAutoPassEnabled: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/companies/123/qa-scoring-settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          qaScoreMaximum: 120,
          qaScoringMode: "subtract_failed_weights",
          minScorableCallDurationSeconds: null,
          repeatContactAutoPassEnabled: false,
        }),
      }),
    );
    expect(saved).toMatchObject({
      qaScoreMaximum: 120,
      qaScoringMode: "subtract_failed_weights",
      minScorableCallDurationSeconds: null,
      repeatContactAutoPassEnabled: false,
    });
  });

  it("surfaces backend validation messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            errors: {
              qaScoreMaximum: [
                "The maximum QA score must be less than or equal to 9999.99.",
              ],
            },
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      saveQaScoringSettings(settings, {
        qaScoreMaximum: 10000,
        qaScoringMode: "weighted_ratio",
        minScorableCallDurationSeconds: null,
        repeatContactAutoPassEnabled: false,
      }),
    ).rejects.toThrow(
      "The maximum QA score must be less than or equal to 9999.99.",
    );
  });
});

describe("QA profile scoring metadata", () => {
  it("preserves section definitions and question assignments through fetch and save", async () => {
    const evaluation = createSectionQaResult().evaluation!;
    const definition = {
      sections: evaluation.sections,
      questions: evaluation.questionResults.map((question) => ({
        id: question.id,
        sectionId: question.sectionId,
        title: question.title,
        description: question.description,
        weight: question.weight,
        isEnabled: true,
      })),
    };
    const response = {
      companyId: 123,
      isConfigured: true,
      isEnabled: true,
      profileName: "Section QA",
      qaScoreMaximum: 100,
      qaScoringMode: "section_weighted_ratio",
      definition,
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify(response),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const profile = await fetchQaProfile(settings);
    expect(profile).toMatchObject(response);

    const saved = await saveQaProfile(settings, profile);

    expect(fetchMock.mock.calls[1][1]?.method).toBe("PUT");
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toMatchObject({
      isEnabled: true,
      profileName: "Section QA",
      definition,
    });
    expect(saved).toMatchObject(response);
  });

  it("normalizes the maximum and scoring mode returned with the profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            companyId: 123,
            isConfigured: true,
            isEnabled: true,
            profileName: "Calls for AI",
            qaScoreMaximum: 120,
            qaScoringMode: "subtract_failed_weights",
            definition: {
              questions: [
                {
                  id: "greeting",
                  title: "Greeting",
                  description: "",
                  weight: 15,
                  isEnabled: true,
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(fetchQaProfile(settings)).resolves.toMatchObject({
      qaScoreMaximum: 120,
      qaScoringMode: "subtract_failed_weights",
      definition: {
        questions: [{ id: "greeting", weight: 15 }],
      },
    });
  });
});
