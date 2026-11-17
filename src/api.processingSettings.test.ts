import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCompanyProcessingSettings, updateCompanyProcessingSettings } from "./api";
import type { AppSettings, CompanyProcessingSettings, ProcessingStageSettings } from "./types";

const settings: AppSettings = {
  baseUrl: "https://api.example.test/",
  companyId: "7",
  apiToken: "",
  accessToken: "staff-session",
};

const stage: ProcessingStageSettings = {
  url: null,
  model: null,
  engine: null,
  hasApiKey: false,
  apiKeyConfigured: false,
  apiKeyDisabled: false,
  defaultUrl: null,
  defaultModel: null,
  defaultEngine: null,
};

const current: CompanyProcessingSettings = {
  companyId: 7,
  version: 4,
  sttProvider: "openai",
  stt: stage,
  diarization: stage,
  redaction: { ...stage, defaultEngine: "builtin" },
  asrCorrection: stage,
  qaEvaluation: stage,
  analysis: stage,
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => vi.unstubAllGlobals());

describe("company processing settings API", () => {
  it("reads the selected STT provider with the existing staff session", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(current));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;

    await expect(fetchCompanyProcessingSettings(settings, "openai", signal)).resolves.toEqual(current);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/companies/7/processing-settings?sttProvider=openai",
      expect.objectContaining({
        headers: { Authorization: "Bearer staff-session" },
        cache: "no-store",
        signal,
      }),
    );
  });

  it("sends a versioned partial update with credential replacements and explicit defaults", async () => {
    const changed = {
      ...current,
      version: 5,
      stt: { ...stage, hasApiKey: true, apiKeyConfigured: true },
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(changed));
    vi.stubGlobal("fetch", fetchMock);

    const update = {
      version: 4,
      sttProvider: "openai",
      stt: { apiKey: "replacement-key" },
      analysis: { url: "", model: "", apiKeyMode: "inherit" },
    } as const;

    await expect(updateCompanyProcessingSettings(settings, update)).resolves.toEqual(changed);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/companies/7/processing-settings");
    expect(init).toMatchObject({
      method: "PUT",
      headers: {
        Authorization: "Bearer staff-session",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual(update);
  });

  it("preserves the conflict status and server message for stale updates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ message: "Settings changed." }, 409)),
    );
    await expect(updateCompanyProcessingSettings(settings, {
      version: 4,
      diarization: { apiKeyMode: "none" },
    })).rejects.toMatchObject({ status: 409, message: "Settings changed." });
  });
});
