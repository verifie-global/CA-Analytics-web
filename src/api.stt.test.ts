import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCallDetail,
  fetchCompanySttSettings,
  requestStandaloneStt,
  saveCompanySttSettings,
} from "./api";
import type { AppSettings } from "./types";

const settings: AppSettings = {
  baseUrl: "https://api.example.test/",
  companyId: "7",
  apiToken: "",
  accessToken: "jwt-token",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => vi.unstubAllGlobals());

describe("company STT settings", () => {
  it("loads settings and applies safe defaults to older partial responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ companyId: 7, defaultLanguage: "ru", enableAudioEnhancement: false }))
      .mockResolvedValueOnce(jsonResponse({ companyId: 7 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCompanySttSettings(settings)).resolves.toEqual({
      companyId: 7,
      defaultLanguage: "ru",
      enableAudioEnhancement: false,
    });
    await expect(fetchCompanySttSettings(settings)).resolves.toEqual({
      companyId: 7,
      defaultLanguage: "auto",
      enableAudioEnhancement: true,
    });
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe(
      "https://api.example.test/api/companies/7/stt-settings",
    );
  });

  it("updates settings with the backend contract", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ companyId: 7, defaultLanguage: "hy", enableAudioEnhancement: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveCompanySttSettings(settings, {
      defaultLanguage: "hy",
      enableAudioEnhancement: true,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init).toMatchObject({
      method: "PUT",
      headers: {
        Authorization: "Bearer jwt-token",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(init.body))).toEqual({
      defaultLanguage: "hy",
      enableAudioEnhancement: true,
    });
    expect(result.defaultLanguage).toBe("hy");
  });

  it.each([401, 403])("preserves HTTP %s authorization errors", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ message: "Denied" }, status)));
    await expect(fetchCompanySttSettings(settings)).rejects.toMatchObject({ status });
  });

  it("surfaces validation messages from failed updates", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ errors: { defaultLanguage: ["Unsupported language."] } }, 400)));
    await expect(saveCompanySttSettings(settings, {
      defaultLanguage: "bad",
      enableAudioEnhancement: true,
    })).rejects.toMatchObject({ status: 400, message: "Unsupported language." });
  });
});

describe("standalone STT and call metadata", () => {
  it("preserves old standalone responses that do not include diagnostics", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      language: "en",
      transcript: "Hello",
      durationSeconds: 1.25,
      segments: [{ speaker: "AGENT", text: "Hello", start: 0, end: 1.25 }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestStandaloneStt(settings, new File(["audio"], "call.wav"));

    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe(
      "https://api.example.test/api/companies/7/stt",
    );
    expect(result).toMatchObject({ language: "en", transcript: "Hello", durationSeconds: 1.25 });
    expect(result.routing).toBeNull();
    expect(result.audioQuality).toBeNull();
    expect(result.segments).toHaveLength(1);
  });

  it("sends standalone routing options and normalizes optional snake-case diagnostics", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      language: "hy",
      transcript: "Բարև",
      duration_seconds: 2,
      segments: [],
      routing: {
        requested_language: "auto",
        selected_engine: "nemo-armenian-custom",
        fallback_used: true,
        fallback_reason: ["language_detected"],
      },
      audio_quality: {
        requested_mode: "auto",
        selected_audio: "sidon",
        decision: "sidon_selected",
        sidon: { attempted: true, used: true, device: "cuda", processing_time_sec: 2.5 },
        raw: { dnsmos: { SIG: 2.1, BAK: 1.9, OVRL: 1.8 } },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestStandaloneStt(
      settings,
      new File(["audio"], "call.wav"),
      { language: "auto", enhancement: "auto" },
    );

    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe(
      "https://api.example.test/api/companies/7/stt?language=auto&enhancement=auto",
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.body as FormData).get("audio")).toBeInstanceOf(File);
    expect(result.routing).toEqual({
      requestedLanguage: "auto",
      selectedEngine: "nemo-armenian-custom",
      fallbackUsed: true,
      fallbackReason: ["language_detected"],
    });
    expect(result.audioQuality?.sidon?.processingTimeSec).toBe(2.5);
    expect(result.audioQuality?.raw?.dnsmos).toEqual({ sig: 2.1, bak: 1.9, ovrl: 1.8 });
  });

  it("normalizes optional call-detail STT metadata without changing transcript rendering", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      conversationId: "call-1",
      status: "Completed",
      transcript: "Original transcript",
      stt: {
        routing: { requestedLanguage: "auto", selectedEngine: "future-engine", fallbackUsed: false },
        audioQuality: { selectedAudio: "raw", decision: "future_decision" },
      },
    })));

    const detail = await fetchCallDetail(settings, "call-1");
    expect(detail.transcript).toBe("Original transcript");
    expect(detail.stt?.routing?.selectedEngine).toBe("future-engine");
    expect(detail.stt?.audioQuality?.selectedAudio).toBe("raw");
  });
});
