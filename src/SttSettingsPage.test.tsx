// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SttSettingsPage } from "./SttSettingsPage";
import type { CompanySttSettings } from "./types";

afterEach(cleanup);

const settings: CompanySttSettings = {
  companyId: 7,
  defaultLanguage: "ru",
  enableAudioEnhancement: false,
};

const renderPage = (overrides: Partial<Parameters<typeof SttSettingsPage>[0]> = {}) => {
  const props: Parameters<typeof SttSettingsPage>[0] = {
    companyId: "7",
    isAdministrator: true,
    value: settings,
    loading: false,
    saving: false,
    errorMessage: "",
    successMessage: "",
    onSave: vi.fn(async () => undefined),
    ...overrides,
  };
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
});
