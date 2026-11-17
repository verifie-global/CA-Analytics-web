// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCompanyProcessingSettings, updateCompanyProcessingSettings } from "./api";
import { ProcessingSettingsPage } from "./ProcessingSettingsPage";
import type { AppSettings, CompanyProcessingSettings, ProcessingStageSettings } from "./types";

vi.mock("./api", () => ({
  fetchCompanyProcessingSettings: vi.fn(),
  updateCompanyProcessingSettings: vi.fn(),
}));

const settings: AppSettings = {
  baseUrl: "https://analytics.example.com",
  companyId: "42",
  accessToken: "staff-token",
  apiToken: "",
};

const emptyStage: ProcessingStageSettings = {
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

const snapshot: CompanyProcessingSettings = {
  companyId: 42,
  version: 7,
  sttProvider: "custom",
  stt: { ...emptyStage, defaultUrl: "https://stt.example.com/transcribe" },
  diarization: emptyStage,
  redaction: { ...emptyStage, defaultEngine: "builtin" },
  asrCorrection: emptyStage,
  qaEvaluation: { ...emptyStage, defaultModel: "default-qa" },
  analysis: {
    ...emptyStage,
    url: "https://models.example.com/v1/chat/completions",
    hasApiKey: true,
    apiKeyConfigured: true,
  },
};

const getSettings = vi.mocked(fetchCompanyProcessingSettings);
const putSettings = vi.mocked(updateCompanyProcessingSettings);
const form = (name: string) => within(screen.getByRole("form", { name }));
const save = (name: string) => fireEvent.click(form(name).getByRole("button", { name: "Save settings" }));

describe("ProcessingSettingsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getSettings.mockResolvedValue(snapshot);
  });

  afterEach(cleanup);

  it("shows the processing stages and links to the existing STT configuration", async () => {
    const openStt = vi.fn();
    render(<ProcessingSettingsPage settings={settings} onOpenSttSettings={openStt} />);

    expect(await screen.findAllByRole("form")).toHaveLength(6);
    expect(form("STT endpoint").getByText("SatisfAI STT service")).toBeTruthy();
    expect(form("STT endpoint").getByPlaceholderText("https://stt.example.com/transcribe")).toBeTruthy();
    expect(form("QA evaluation").getByPlaceholderText("default-qa")).toBeTruthy();
    expect(form("Text redaction").queryByLabelText("Endpoint URL")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open STT settings" }));
    expect(openStt).toHaveBeenCalledOnce();
  });

  it("saves an isolated stage patch and preserves drafts in other stages", async () => {
    const next = {
      ...snapshot,
      version: 8,
      qaEvaluation: { ...snapshot.qaEvaluation, model: "qa-custom" },
    };
    putSettings.mockResolvedValue(next);

    render(<ProcessingSettingsPage settings={settings} onOpenSttSettings={() => {}} />);
    await screen.findByRole("form", { name: "QA evaluation" });

    fireEvent.change(form("Speaker diarization").getByLabelText("Endpoint URL"), {
      target: { value: "https://diarization.example.com/speakers" },
    });
    fireEvent.change(form("QA evaluation").getByLabelText("Model ID"), { target: { value: "qa-custom" } });
    save("QA evaluation");

    await waitFor(() => expect(putSettings).toHaveBeenCalledWith(
      expect.objectContaining(settings),
      { version: 7, qaEvaluation: { model: "qa-custom" } },
      expect.any(AbortSignal),
    ));
    expect(await screen.findByText("Settings saved.")).toBeTruthy();
    expect((form("Speaker diarization").getByLabelText("Endpoint URL") as HTMLInputElement).value)
      .toBe("https://diarization.example.com/speakers");
  });

  it("writes a new key with an endpoint change and clears the password field after saving", async () => {
    const replacementUrl = "https://new-models.example.com/v1/chat/completions";
    putSettings.mockResolvedValue({
      ...snapshot,
      version: 8,
      analysis: { ...snapshot.analysis, url: replacementUrl },
    });

    render(<ProcessingSettingsPage settings={settings} onOpenSttSettings={() => {}} />);
    await screen.findByRole("form", { name: "Satisfaction and call analysis" });

    const analysis = form("Satisfaction and call analysis");
    expect(analysis.queryByLabelText("New API key")).toBeNull();
    fireEvent.change(analysis.getByLabelText("Endpoint URL"), { target: { value: replacementUrl } });
    expect(analysis.getByText(/Changing the endpoint clears the saved API key/)).toBeTruthy();
    fireEvent.change(analysis.getByLabelText("API key"), { target: { value: "replace" } });
    const key = analysis.getByLabelText("New API key") as HTMLInputElement;
    expect(key.type).toBe("password");
    expect(key.value).toBe("");
    fireEvent.change(key, { target: { value: "replacement-test-key" } });
    save("Satisfaction and call analysis");

    await waitFor(() => expect(putSettings).toHaveBeenCalledWith(
      expect.objectContaining(settings),
      { version: 7, analysis: { url: replacementUrl, apiKey: "replacement-test-key" } },
      expect.any(AbortSignal),
    ));
    await waitFor(() => expect(analysis.queryByLabelText("New API key")).toBeNull());
  });

  it("allows external redaction to use no API key and locks Google STT endpoint overrides", async () => {
    getSettings.mockResolvedValue({ ...snapshot, sttProvider: "gcp" });
    const endpoint = "https://redaction.example.com/redact";
    putSettings.mockResolvedValue({
      ...snapshot,
      version: 8,
      sttProvider: "gcp",
      redaction: { ...snapshot.redaction, engine: "external", url: endpoint, apiKeyDisabled: true },
    });
    render(<ProcessingSettingsPage settings={settings} onOpenSttSettings={() => {}} />);
    await screen.findByRole("form", { name: "STT endpoint" });
    expect(form("STT endpoint").queryByLabelText("Endpoint URL")).toBeNull();
    expect(form("STT endpoint").getByText("Google Cloud")).toBeTruthy();

    const redaction = form("Text redaction");
    fireEvent.change(redaction.getByLabelText("Redaction engine"), { target: { value: "external" } });
    expect((redaction.getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(redaction.getByLabelText("Endpoint URL"), { target: { value: endpoint } });
    fireEvent.change(redaction.getByLabelText("API key"), { target: { value: "none" } });
    save("Text redaction");
    await waitFor(() => expect(putSettings).toHaveBeenCalledWith(
      expect.objectContaining(settings),
      { version: 7, redaction: { engine: "external", url: endpoint, apiKeyMode: "none" } },
      expect.any(AbortSignal),
    ));
    expect(await redaction.findByText("API key disabled")).toBeTruthy();
  });

  it("blocks saving after a conflict and reloads a newer version", async () => {
    getSettings.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ ...snapshot, version: 8 });
    putSettings.mockRejectedValueOnce(Object.assign(new Error("Conflict"), { status: 409 }));
    putSettings.mockResolvedValueOnce({ ...snapshot, version: 9 });

    render(<ProcessingSettingsPage settings={settings} onOpenSttSettings={() => {}} />);
    await screen.findByRole("form", { name: "STT endpoint" });
    const endpoint = "https://custom-stt.example.com/transcribe";
    fireEvent.change(form("STT endpoint").getByLabelText("Endpoint URL"), { target: { value: endpoint } });
    save("STT endpoint");
    const reload = await screen.findByRole("button", { name: "Reload settings" });
    expect((form("STT endpoint").getByRole("button", { name: "Save settings" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(reload);
    await screen.findByRole("form", { name: "STT endpoint" });
    expect((form("STT endpoint").getByLabelText("Endpoint URL") as HTMLInputElement).value).toBe("");
    fireEvent.change(form("STT endpoint").getByLabelText("Endpoint URL"), { target: { value: endpoint } });
    save("STT endpoint");
    await waitFor(() => expect(putSettings).toHaveBeenLastCalledWith(
      expect.objectContaining(settings),
      { version: 8, sttProvider: "custom", stt: { url: endpoint } },
      expect.any(AbortSignal),
    ));
  });

  it("clears the STT draft when a save detects a different active provider", async () => {
    putSettings.mockResolvedValue({
      ...snapshot,
      version: 8,
      sttProvider: "openai",
      stt: { ...emptyStage, url: "https://openai.example.com/v1/audio/transcriptions" },
    });
    render(<ProcessingSettingsPage settings={settings} onOpenSttSettings={() => {}} />);
    await screen.findByRole("form", { name: "STT endpoint" });

    const stt = form("STT endpoint");
    fireEvent.change(stt.getByLabelText("Endpoint URL"), { target: { value: "https://unsaved-stt.example.com/transcribe" } });
    fireEvent.change(stt.getByLabelText("API key"), { target: { value: "replace" } });
    fireEvent.change(stt.getByLabelText("New API key"), { target: { value: "unused-test-key" } });
    fireEvent.change(form("QA evaluation").getByLabelText("Model ID"), { target: { value: "qa-custom" } });
    save("QA evaluation");

    expect(await stt.findByText("OpenAI")).toBeTruthy();
    expect(stt.queryByLabelText("New API key")).toBeNull();
    expect((stt.getByLabelText("Endpoint URL") as HTMLInputElement).value)
      .toBe("https://openai.example.com/v1/audio/transcriptions");
  });

  it("ignores a settings response from a previous company", async () => {
    let resolvePrevious: (value: CompanyProcessingSettings) => void = () => {};
    getSettings.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePrevious = resolve;
    }));
    getSettings.mockResolvedValueOnce({ ...snapshot, companyId: 84, sttProvider: "gcp" });

    const onOpenSttSettings = () => {};
    const { rerender } = render(<ProcessingSettingsPage settings={settings} onOpenSttSettings={onOpenSttSettings} />);
    rerender(<ProcessingSettingsPage settings={{ ...settings, companyId: "84" }} onOpenSttSettings={onOpenSttSettings} />);
    await screen.findByRole("form", { name: "STT endpoint" });

    await act(async () => resolvePrevious(snapshot));
    expect(form("STT endpoint").getByText("Google Cloud")).toBeTruthy();
    expect(form("STT endpoint").queryByText("SatisfAI STT service")).toBeNull();
  });
});

