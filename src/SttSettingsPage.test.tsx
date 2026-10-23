// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SttSettingsPage } from "./SttSettingsPage";
import type { CompanySttSettings } from "./types";
import { I18nProvider, LOCALE_STORAGE_KEY } from "./i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const settings: CompanySttSettings = {
  companyId: 7,
  provider: "custom",
  model: null,
  defaultLanguage: "ru",
  enableAudioEnhancement: false,
};

const renderPageProps = (overrides: Partial<Parameters<typeof SttSettingsPage>[0]> = {}): Parameters<typeof SttSettingsPage>[0] => (
  {
    companyId: "7",
    isAdministrator: true,
    value: settings,
    loading: false,
    saving: false,
    errorMessage: "",
    successMessage: "",
    onSave: vi.fn(async () => undefined),
    ...overrides,
  }
);

const renderPage = (overrides: Partial<Parameters<typeof SttSettingsPage>[0]> = {}) => {
  const props = renderPageProps(overrides);
  render(<SttSettingsPage {...props} />);
  return props;
};

describe("STT settings page", () => {
  it("shows loading state and safe defaults", () => {
    const { rerender } = render(
      <SttSettingsPage
        companyId="7"
        isAdministrator
        value={null}
        loading
        saving={false}
        errorMessage=""
        successMessage=""
        onSave={vi.fn(async () => undefined)}
      />,
    );
    expect(screen.getByText("Loading STT settings")).toBeTruthy();

    rerender(
      <SttSettingsPage
        companyId="7"
        isAdministrator
        value={null}
        loading={false}
        saving={false}
        errorMessage=""
        successMessage=""
        onSave={vi.fn(async () => undefined)}
      />,
    );
    expect((screen.getByLabelText("Default transcription language") as HTMLSelectElement).value).toBe("auto");
    expect((screen.getByRole("switch", { name: "Automatic audio enhancement" }) as HTMLInputElement).checked).toBe(true);
  });

  it("loads company values and saves updates", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderPage({ onSave });

    expect((screen.getByLabelText("Default transcription language") as HTMLSelectElement).value).toBe("ru");
    expect((screen.getByRole("switch", { name: "Automatic audio enhancement" }) as HTMLInputElement).checked).toBe(false);

    await user.selectOptions(screen.getByLabelText("Default transcription language"), "hy");
    await user.click(screen.getByRole("switch", { name: "Automatic audio enhancement" }));
    await user.click(screen.getByRole("button", { name: "Save STT settings" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      provider: "custom",
      model: null,
      defaultLanguage: "hy",
      enableAudioEnhancement: true,
    }));
  });

  it("toggles audio enhancement when the visible switch is clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SttSettingsPage
        companyId="7"
        isAdministrator
        value={{ ...settings, enableAudioEnhancement: true }}
        loading={false}
        saving={false}
        errorMessage=""
        successMessage=""
        onSave={vi.fn(async () => undefined)}
      />,
    );
    const toggle = screen.getByRole("switch", { name: "Automatic audio enhancement" }) as HTMLInputElement;
    const visibleTrack = container.querySelector(".switch-control > span[aria-hidden='true']");

    expect(toggle.checked).toBe(true);
    expect(visibleTrack).not.toBeNull();
    await user.click(visibleTrack!);
    expect(toggle.checked).toBe(false);
  });

  it("does not expose settings to non-administrators", () => {
    renderPage({ isAdministrator: false });
    expect(screen.getByRole("alert").textContent).toContain("Administrator access is required");
    expect(screen.queryByLabelText("Default transcription language")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save STT settings" })).toBeNull();
  });

  it("renders loading, validation/API errors, forbidden errors, and success messages", () => {
    const { rerender } = render(
      <SttSettingsPage
        companyId="7"
        isAdministrator
        value={settings}
        loading={false}
        saving={false}
        errorMessage="Unsupported language."
        successMessage=""
        onSave={vi.fn(async () => undefined)}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Unsupported language.");

    rerender(
      <SttSettingsPage
        companyId="7"
        isAdministrator
        value={settings}
        loading={false}
        saving={false}
        errorMessage="Your account is not allowed to manage STT settings."
        successMessage="STT settings saved successfully."
        onSave={vi.fn(async () => undefined)}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("not allowed");
    expect(screen.getByRole("status").textContent).toContain("saved successfully");
  });

  it("keeps an unknown backend language code selectable", () => {
    renderPage({ value: { ...settings, defaultLanguage: "fr-CA" } });
    expect((screen.getByLabelText("Default transcription language") as HTMLSelectElement).value).toBe("fr-CA");
    expect(screen.getByRole("option", { name: "FR-CA (current)" })).toBeTruthy();
  });

  it("shows provider-dependent choices, resets the model, and preserves the other unsaved controls", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderPage({ value: { ...settings, provider: "openai", model: "whisper-1" }, onSave });
    const provider = screen.getByLabelText("Transcription provider");
    const model = () => screen.getByLabelText("Transcription model") as HTMLSelectElement;
    expect(model().value).toBe("whisper-1");
    expect(within(model()).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Use provider default", "gpt-transcribe (recommended)", "gpt-4o-transcribe (legacy)",
      "gpt-4o-mini-transcribe (legacy)", "gpt-4o-mini-transcribe-2025-12-15 (legacy)",
      "gpt-4o-transcribe-diarize (legacy)", "whisper-1 (legacy)",
    ]);

    await user.selectOptions(screen.getByLabelText("Default transcription language"), "hy");
    await user.click(screen.getByRole("switch"));
    await user.selectOptions(provider, "gcp");
    expect(model().value).toBe("");
    expect(within(model()).getAllByRole("option").map((option) => (option as HTMLOptionElement).value)).toEqual([
      "", "chirp_3", "chirp_2", "chirp", "long", "short", "telephony", "telephony_short",
    ]);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save STT settings" }));
    expect(onSave).toHaveBeenCalledWith({ provider: "gcp", model: null, defaultLanguage: "hy", enableAudioEnhancement: true });

    await user.selectOptions(model(), "chirp_3");
    await user.selectOptions(provider, "openai");
    expect(model().value).toBe("");
    await user.selectOptions(provider, "custom");
    expect(screen.getByRole("textbox", { name: "Transcription model" })).toBeTruthy();
  });

  it("allows choosing a model or reverting it to provider default without changing language or enhancement", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderPage({ value: { ...settings, provider: "openai", model: "whisper-1" }, onSave });
    await user.selectOptions(screen.getByLabelText("Transcription model"), "gpt-transcribe");
    await user.click(screen.getByRole("button", { name: "Save STT settings" }));
    expect(onSave).toHaveBeenLastCalledWith({ provider: "openai", model: "gpt-transcribe", defaultLanguage: "ru", enableAudioEnhancement: false });
    await user.selectOptions(screen.getByLabelText("Transcription model"), "");
    await user.click(screen.getByRole("button", { name: "Save STT settings" }));
    expect(onSave).toHaveBeenLastCalledWith({ provider: "openai", model: null, defaultLanguage: "ru", enableAudioEnhancement: false });
  });

  it.each(["-model", "_model", ".model", "/model", "bad model", "model@1", "մոդել", "a".repeat(65)])("rejects invalid custom model %s", async (invalid) => {
    const onSave = vi.fn(async () => undefined);
    const { container } = render(<SttSettingsPage {...renderPageProps({ onSave })} />);
    fireEvent.change(screen.getByLabelText("Transcription model"), { target: { value: invalid } });
    expect(screen.getByRole("alert").textContent).toContain("Enter a model");
    expect((screen.getByRole("button", { name: "Save STT settings" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(container.querySelector("form")!);
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each(["model.v1_test/path-2", "1", "a".repeat(64)])("accepts valid custom model %s", async (model) => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderPage({ onSave });
    const input = screen.getByLabelText("Transcription model") as HTMLInputElement;
    expect(input.maxLength).toBe(64);
    await user.type(input, model);
    await user.click(screen.getByRole("button", { name: "Save STT settings" }));
    expect(onSave).toHaveBeenCalledWith({ provider: "custom", model, defaultLanguage: "ru", enableAudioEnhancement: false });
  });

  it("sends null for an empty custom model and resets unsaved changes", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderPage({ value: { ...settings, model: "custom-v1" }, onSave });
    await user.clear(screen.getByLabelText("Transcription model"));
    await user.click(screen.getByRole("button", { name: "Save STT settings" }));
    expect(onSave).toHaveBeenCalledWith({ provider: "custom", model: null, defaultLanguage: "ru", enableAudioEnhancement: false });
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect((screen.getByLabelText("Transcription model") as HTMLInputElement).value).toBe("custom-v1");
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("uses returned effective models as-is, including unknown model names", () => {
    renderPage({ value: { ...settings, provider: "gcp", model: "future-model" } });
    expect((screen.getByLabelText("Transcription model") as HTMLSelectElement).value).toBe("future-model");
    expect(screen.getByRole("option", { name: "future-model (current)" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save STT settings" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables editing while saving and retains the draft after a rejected save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => { throw new Error("Failed"); });
    const props = renderPageProps({ onSave });
    const { rerender } = render(<SttSettingsPage {...props} />);
    await user.selectOptions(screen.getByLabelText("Transcription provider"), "openai");
    await user.click(screen.getByRole("button", { name: "Save STT settings" }));
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    rerender(<SttSettingsPage {...props} saving />);
    expect((screen.getByLabelText("Transcription provider") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<SttSettingsPage {...props} errorMessage="Failed" />);
    expect(screen.getByRole("alert").textContent).toBe("Failed");
    expect((screen.getByLabelText("Transcription provider") as HTMLSelectElement).value).toBe("openai");
    expect((screen.getByRole("button", { name: "Save STT settings" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("discards the previous company's draft while the next company loads", async () => {
    const user = userEvent.setup();
    const props = renderPageProps();
    const { rerender } = render(<SttSettingsPage {...props} />);
    await user.type(screen.getByLabelText("Transcription model"), "unsaved-a");
    rerender(<SttSettingsPage {...props} companyId="8" loading />);
    expect(screen.queryByLabelText("Transcription model")).toBeNull();
    rerender(<SttSettingsPage {...props} companyId="8" value={{ ...settings, companyId: 8, provider: "gcp", model: "chirp_3" }} />);
    expect((screen.getByLabelText("Transcription model") as HTMLSelectElement).value).toBe("chirp_3");
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it.each([
    ["hy", "Խոսքի ճանաչման մատակարար", "Խոսքի ճանաչման մոդել"],
    ["ru", "Провайдер распознавания речи", "Модель распознавания речи"],
  ])("localizes the controls in %s", async (locale, providerLabel, modelLabel) => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    render(<I18nProvider><SttSettingsPage {...renderPageProps()} /></I18nProvider>);
    expect(await screen.findByLabelText(providerLabel)).toBeTruthy();
    expect(screen.getByLabelText(modelLabel)).toBeTruthy();
  });
});
