// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { I18nProvider } from "./i18n";
import type { CompanySttSettings, ProcessingStageSettings } from "./types";

const endpoint = "https://api.example.test/api/companies/42/processing-settings";
const stage: ProcessingStageSettings = {
  url: null, model: null, engine: null, hasApiKey: false, apiKeyConfigured: false,
  apiKeyDisabled: false, defaultUrl: null, defaultModel: null, defaultEngine: null,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
const saveSession = (userRole = "Admin") => localStorage.setItem("ca-analytics-settings", JSON.stringify({
  baseUrl: "https://api.example.test", companyId: "42", apiToken: "",
  accessToken: "jwt-token", userId: "17", userRole, preferredLocale: "en",
}));

function mockApi(saveStatus = 200, admin = true, processingStatus = 200) {
  let stt: CompanySttSettings = {
    companyId: 42, provider: "openai", model: "gpt-transcribe", defaultLanguage: "hy", enableAudioEnhancement: false,
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/me")) {
      return json({ companyId: 42, userId: 17, userRole: admin ? "Admin" : "User", preferredLocale: "en" });
    }
    if (url.endsWith("/stt-settings")) {
      if (init?.method === "PUT") {
        if (saveStatus !== 200) return json({ message: "Denied" }, saveStatus);
        stt = { ...stt, ...JSON.parse(String(init.body)) };
      }
      return json(stt);
    }
    if (url === endpoint) {
      if (processingStatus !== 200) return json({ message: "Processing settings unavailable." }, processingStatus);
      return json({
        companyId: 42, version: stt.provider === "openai" ? 3 : 4, sttProvider: stt.provider,
        stt: { ...stage, defaultUrl: "https://openai.example.test/v1/audio/transcriptions" },
        diarization: stage, redaction: stage, asrCorrection: stage, qaEvaluation: stage, analysis: stage,
      });
    }
    if (url.endsWith("/users")) return json({ items: [] }, admin ? 200 : 403);
    if (url.endsWith("/localization/options")) return json({ defaultLocale: "en", supportedLocales: [{
      code: "en", englishName: "English", nativeName: "English", textDirection: "ltr",
    }] });
    if (url.includes("/calls/filter-options")) return json({ agents: [], customers: [] });
    if (url.includes("/calls?")) return json({ items: [], page: 1, pageSize: 10, total: 0 });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("STT settings in Processing Settings", () => {
  it("saves transcription defaults and refreshes the endpoint for the saved provider", async () => {
    const user = userEvent.setup();
    saveSession();
    const fetchMock = mockApi();
    window.history.replaceState({}, "", "/admin/processing-settings");
    render(<I18nProvider><App /></I18nProvider>);
    const provider = await screen.findByLabelText("Transcription provider");
    await waitFor(() => expect((provider as HTMLSelectElement).value).toBe("openai"));
    expect((screen.getByLabelText("Transcription model") as HTMLSelectElement).value).toBe("gpt-transcribe");
    const sttEndpoint = within(await screen.findByRole("form", { name: "STT endpoint" }));
    expect(sttEndpoint.getByLabelText("Endpoint URL")).toBeTruthy();
    await user.type(within(screen.getByRole("form", { name: "Speaker diarization" })).getByLabelText("Endpoint URL"),
      "https://diarization.example.test");
    await user.selectOptions(provider, "gcp");
    await user.click(screen.getByRole("button", { name: "Save STT settings" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/companies/42/stt-settings", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ provider: "gcp", model: null, defaultLanguage: "hy", enableAudioEnhancement: false }),
      headers: { Authorization: "Bearer jwt-token", "Content-Type": "application/json" },
    })));
    await screen.findByText("STT settings saved successfully.");
    expect((provider as HTMLSelectElement).value).toBe("gcp");
    const refreshedEndpoint = within(await screen.findByRole("form", { name: "STT endpoint" }));
    expect(refreshedEndpoint.getByText("Google Cloud")).toBeTruthy();
    expect(refreshedEndpoint.queryByLabelText("Endpoint URL")).toBeNull();
    const diarization = within(screen.getByRole("form", { name: "Speaker diarization" }));
    expect((diarization.getByLabelText("Endpoint URL") as HTMLInputElement).value).toBe("https://diarization.example.test");
  });

  it("keeps the transcription settings available when the processing endpoint fails", async () => {
    saveSession();
    mockApi(200, true, 500);
    window.history.replaceState({}, "", "/admin/stt-settings");
    render(<I18nProvider><App /></I18nProvider>);

    expect(await screen.findByText("Processing settings unavailable.")).toBeTruthy();
    const provider = await screen.findByLabelText<HTMLSelectElement>("Transcription provider");
    expect(provider.disabled).toBe(false);
  });

  it("does not load or expose company STT settings for non-administrators", async () => {
    saveSession("User");
    const fetchMock = mockApi(200, false);
    window.history.replaceState({}, "", "/admin/stt-settings");
    render(<I18nProvider><App /></I18nProvider>);
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/users"))).toBe(true));
    expect(screen.queryByLabelText("Transcription provider")).toBeNull();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/stt-settings"))).toBe(false);
  });

  it("uses the existing expired-session flow on a 401 save response", async () => {
    const user = userEvent.setup();
    saveSession();
    mockApi(401);
    window.history.replaceState({}, "", "/admin/processing-settings");
    render(<I18nProvider><App /></I18nProvider>);
    const provider = await screen.findByLabelText("Transcription provider");
    await waitFor(() => expect((provider as HTMLSelectElement).value).toBe("openai"));
    await user.selectOptions(provider, "gcp");
    await user.click(screen.getByRole("button", { name: "Save STT settings" }));
    expect(await screen.findByText("Your session expired. Please sign in again.")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("ca-analytics-settings")!)).toMatchObject({
      companyId: "", accessToken: "", apiToken: "",
    });
    expect(screen.queryByLabelText("Transcription provider")).toBeNull();
  });
});
