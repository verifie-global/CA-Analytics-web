// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SttSettingsPage } from "./SttSettingsPage";
import { useCompanySttSettings } from "./useCompanySttSettings";
import type { AppSettings, CompanySttSettings } from "./types";

const session: AppSettings = {
  baseUrl: "https://api.example.test",
  companyId: "7",
  accessToken: "admin-bearer-token",
  apiToken: "",
};
const settings: CompanySttSettings = {
  companyId: 7, provider: "custom", model: "custom-v1", defaultLanguage: "ru", enableAudioEnhancement: false,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const onUnauthorized = vi.fn();

function ConnectedPage({
  companyId = "7", enabled = true, pageOpen = true,
}: { companyId?: string; enabled?: boolean; pageOpen?: boolean }) {
  const state = useCompanySttSettings({ ...session, companyId }, enabled, pageOpen, onUnauthorized);
  return <SttSettingsPage
    key={companyId}
    companyId={companyId}
    isAdministrator={enabled && !state.forbidden}
    value={state.value}
    loading={state.loading}
    saving={state.saving}
    errorMessage={state.errorMessage}
    successMessage={state.successMessage}
    onSave={state.save}
  />;
}

const provider = () => screen.getByLabelText("Transcription provider") as HTMLSelectElement;
const model = () => screen.getByLabelText("Transcription model") as HTMLInputElement | HTMLSelectElement;
const saveButton = () => screen.getByRole("button", { name: "Save STT settings" }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
  onUnauthorized.mockReset();
  vi.unstubAllGlobals();
});

describe("company STT settings lifecycle", () => {
  it("loads the company settings with its Bearer token before allowing edits", async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectedPage />);
    expect(screen.getByText("Loading STT settings")).toBeTruthy();
    expect(screen.queryByLabelText("Transcription provider")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/companies/7/stt-settings", expect.objectContaining({
      headers: { Authorization: "Bearer admin-bearer-token" },
    }));
    await act(async () => pending.resolve(json(settings)));
    expect(provider().value).toBe("custom");
    expect(model().value).toBe("custom-v1");
    expect((screen.getByLabelText("Default transcription language") as HTMLSelectElement).value).toBe("ru");
    expect((screen.getByRole("switch") as HTMLInputElement).checked).toBe(false);
    expect(saveButton().disabled).toBe(true);
  });

  it("saves all four settings only on Save and adopts all returned values, including the effective model", async () => {
    const user = userEvent.setup();
    const pendingSave = deferred<Response>();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(settings))
      .mockReturnValueOnce(pendingSave.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectedPage />);
    await screen.findByLabelText("Transcription provider");
    await user.selectOptions(provider(), "openai");
    expect(model().value).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(saveButton());
    expect(fetchMock).toHaveBeenLastCalledWith("https://api.example.test/api/companies/7/stt-settings", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ provider: "openai", model: null, defaultLanguage: "ru", enableAudioEnhancement: false }),
      headers: { Authorization: "Bearer admin-bearer-token", "Content-Type": "application/json" },
    }));
    expect(provider().disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeTruthy();
    await act(async () => pendingSave.resolve(json({
      ...settings, provider: "openai", model: "gpt-transcribe", defaultLanguage: "hy", enableAudioEnhancement: true,
    })));
    expect(model().value).toBe("gpt-transcribe");
    expect((screen.getByLabelText("Default transcription language") as HTMLSelectElement).value).toBe("hy");
    expect((screen.getByRole("switch") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("STT settings saved successfully.");
    expect(saveButton().disabled).toBe(true);
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("ignores an earlier company's delayed load without replacing the new company's draft", async () => {
    const user = userEvent.setup();
    const firstLoad = deferred<Response>();
    const nextLoad = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(firstLoad.promise).mockReturnValueOnce(nextLoad.promise));
    const { rerender } = render(<ConnectedPage />);
    rerender(<ConnectedPage companyId="8" />);
    expect(screen.getByText("Loading STT settings")).toBeTruthy();
    await act(async () => nextLoad.resolve(json({ ...settings, companyId: 8, provider: "gcp", model: "chirp_3" })));
    await user.selectOptions(model(), "chirp_2");
    await act(async () => firstLoad.resolve(json(settings)));
    expect(provider().value).toBe("gcp");
    expect(model().value).toBe("chirp_2");
    expect(screen.getByText("Company 8")).toBeTruthy();
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("ignores old responses even after switching away and back to the same company", async () => {
    const original = deferred<Response>();
    const other = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn()
      .mockReturnValueOnce(original.promise)
      .mockReturnValueOnce(other.promise)
      .mockResolvedValueOnce(json({ ...settings, provider: "openai", model: "gpt-transcribe" })));
    const { rerender } = render(<ConnectedPage />);
    rerender(<ConnectedPage companyId="8" />);
    rerender(<ConnectedPage />);
    await waitFor(() => expect(model().value).toBe("gpt-transcribe"));
    await act(async () => {
      original.resolve(json(settings));
      other.resolve(json({ message: "Expired" }, 401));
    });
    expect(model().value).toBe("gpt-transcribe");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it.each([200, 400, 401, 403])("ignores a delayed save response (%s) after switching company", async (status) => {
    const user = userEvent.setup();
    const oldSave = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json(settings))
      .mockReturnValueOnce(oldSave.promise)
      .mockResolvedValueOnce(json({ ...settings, companyId: 8, provider: "gcp", model: "chirp_3" })));
    const { rerender } = render(<ConnectedPage />);
    await screen.findByLabelText("Transcription provider");
    await user.selectOptions(provider(), "openai");
    await user.click(saveButton());
    rerender(<ConnectedPage companyId="8" />);
    await waitFor(() => expect(model().value).toBe("chirp_3"));
    await user.selectOptions(model(), "telephony");
    await act(async () => oldSave.resolve(json(status === 200 ? { ...settings, provider: "openai", model: "gpt-transcribe" } : { message: "Old company error" }, status)));
    expect(provider().value).toBe("gcp");
    expect(model().value).toBe("telephony");
    expect(provider().disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("STT settings saved successfully.")).toBeNull();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 500])("handles a save failure (%s) without reporting success", async (status) => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json(settings))
      .mockResolvedValueOnce(json({ errors: { model: ["Unsupported transcription model."] } }, status)));
    render(<ConnectedPage />);
    await screen.findByLabelText("Transcription provider");
    await user.selectOptions(provider(), "openai");
    await user.click(saveButton());
    if (status === 401) {
      await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce());
    } else if (status === 403) {
      expect(await screen.findByRole("heading", { name: "Permission denied" })).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toContain("Your account is not allowed to manage STT settings.");
      expect(screen.queryByLabelText("Transcription provider")).toBeNull();
    } else {
      expect((await screen.findByRole("alert")).textContent).toBe("Unsupported transcription model.");
      expect(provider().value).toBe("openai");
      expect(model().value).toBe("");
      expect(saveButton().disabled).toBe(false);
      expect(screen.getByText("Unsaved changes")).toBeTruthy();
    }
    expect(screen.queryByText("STT settings saved successfully.")).toBeNull();
  });

  it.each([400, 401, 403])("handles a load failure (%s) before allowing edits", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Cannot load settings." }, status)));
    render(<ConnectedPage />);
    if (status === 401) {
      await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce());
    } else {
      expect((await screen.findByRole("alert")).textContent).toContain(
        status === 403 ? "not allowed" : "Cannot load settings.",
      );
      if (status === 400) {
        expect(provider().disabled).toBe(true);
        expect(saveButton().disabled).toBe(true);
      }
    }
  });

  it("reloads settings when opening the page and does not fetch or save for non-administrators", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(settings))
      .mockResolvedValueOnce(json({ ...settings, model: "new-company-default" }));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<ConnectedPage enabled={false} pageOpen={false} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Transcription provider")).toBeNull();
    rerender(<ConnectedPage pageOpen={false} />);
    await waitFor(() => expect(model().value).toBe("custom-v1"));
    rerender(<ConnectedPage pageOpen />);
    await waitFor(() => expect(model().value).toBe("new-company-default"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retains a pending save when navigating within the same company", async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockResolvedValueOnce(json(settings)).mockReturnValueOnce(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<ConnectedPage />);
    await screen.findByLabelText("Transcription provider");
    await user.selectOptions(provider(), "openai");
    await user.click(saveButton());
    rerender(<ConnectedPage pageOpen={false} />);
    rerender(<ConnectedPage pageOpen />);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(json({ ...settings, provider: "openai", model: "gpt-transcribe" })));
    expect(model().value).toBe("gpt-transcribe");
    expect(screen.getByText("STT settings saved successfully.")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it("does not clear the new company's saving state when an older save finishes", async () => {
    const user = userEvent.setup();
    const oldSave = deferred<Response>();
    const newSave = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json(settings))
      .mockReturnValueOnce(oldSave.promise)
      .mockResolvedValueOnce(json({ ...settings, companyId: 8, provider: "gcp", model: "chirp_3" }))
      .mockReturnValueOnce(newSave.promise));
    const { rerender } = render(<ConnectedPage />);
    await screen.findByLabelText("Transcription provider");
    await user.selectOptions(provider(), "openai");
    await user.click(saveButton());
    rerender(<ConnectedPage companyId="8" />);
    await waitFor(() => expect(model().value).toBe("chirp_3"));
    await user.selectOptions(model(), "long");
    await user.click(saveButton());
    await act(async () => oldSave.resolve(json({ ...settings, provider: "openai", model: "gpt-transcribe" })));
    expect(provider().disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeTruthy();
    await act(async () => newSave.resolve(json({ ...settings, companyId: 8, provider: "gcp", model: "long" })));
    expect(model().value).toBe("long");
    expect(screen.getByText("STT settings saved successfully.")).toBeTruthy();
  });
});
