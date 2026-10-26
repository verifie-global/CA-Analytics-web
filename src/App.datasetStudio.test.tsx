// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App, { getRouteFromPath } from "./App";
import { I18nProvider } from "./i18n";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function setup(sessionStatus = 200) {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  localStorage.setItem("ca-analytics-settings", JSON.stringify({ baseUrl: "https://api.example.test", companyId: "42", apiToken: "partner-token", accessToken: "jwt-token", userRole: "User", preferredLocale: "en" }));
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/annotation-sessions")) return json([{ id: "session", name: "Training calls", provider: "gcp", model: "chirp_3", language: "hy", createdAt: "2026-10-26T10:00:00Z", recordings: 1, readyRecordings: 1, failedRecordings: 0, clips: 1, verified: 0, rejected: 0 }], sessionStatus);
    if (url.includes("/annotation-sessions/session/clips?")) return json({ items: [{ id: "clip", recordingId: "recording", index: 1, startSeconds: 0, endSeconds: 12, originalText: "Original", text: "Saved transcript", status: "pending", note: null, revision: "revision", reviewedAt: null, reviewedByUserId: null, recordingDuration: 120, recordingName: "Support call" }], total: 1, page: 1, pageSize: 50 });
    if (url.includes("/annotation-sessions/session/clips/clip/audio?")) return new Response("wav", { headers: { "Content-Type": "audio/wav" } });
    if (url.endsWith("/annotation-sessions/session")) return json({ id: "session", name: "Training calls", provider: "gcp", model: "chirp_3", language: "hy", minClipSeconds: 10, maxClipSeconds: 15, createdAt: "2026-10-26T10:00:00Z", recordings: [{ id: "recording", conversationId: 1, name: "Support call", status: "ready", error: null, durationSeconds: 120, originalTranscript: "Original", clips: 1, verified: 0, rejected: 0 }] });
    if (url.endsWith("/users")) return json({ items: [] }, 403);
    if (url.endsWith("/localization/options")) return json({ defaultLocale: "en", supportedLocales: [{ code: "en", englishName: "English", nativeName: "English", textDirection: "ltr" }] });
    if (url.includes("/calls/filter-options")) return json({ agents: [], customers: [] });
    if (url.includes("/calls?")) return json({ items: [], page: 1, pageSize: 10, total: 0 });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:audio") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
  return fetchMock;
}

afterEach(() => {
  cleanup(); localStorage.clear(); sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("Dataset Studio app integration", () => {
  it("opens through the existing navigation for company users and retains edits across app routes", async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    render(<I18nProvider><App /></I18nProvider>);
    await user.click(await screen.findByRole("button", { name: "Dataset Studio" }));
    expect(window.location.pathname).toBe("/dataset-studio");
    await user.click(await screen.findByRole("button", { name: "Open session" }));
    const transcript = await screen.findByLabelText("Corrected transcript");
    fireEvent.change(transcript, { target: { value: "Հայերեն local draft" } });
    await user.click(screen.getByRole("button", { name: "Reports" }));
    expect(screen.queryByLabelText("Corrected transcript")).toBeNull();
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await user.click(screen.getByRole("button", { name: "Dataset Studio" }));
    expect((await screen.findByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toBe("Հայերեն local draft");
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/companies/42/annotation-sessions", expect.objectContaining({ headers: { Authorization: "Bearer jwt-token" } }));
  });

  it("supports direct URLs and the existing expired-session sign-in flow", async () => {
    expect(getRouteFromPath("/dataset-studio")).toBe("dataset-studio");
    expect(getRouteFromPath("/dataset-studio/")).toBe("dataset-studio");
    setup(401);
    window.history.replaceState({}, "", "/dataset-studio");
    render(<I18nProvider><App /></I18nProvider>);
    await screen.findByText("Your session expired. Please sign in again.");
    await waitFor(() => expect(JSON.parse(localStorage.getItem("ca-analytics-settings")!)).toMatchObject({ companyId: "", accessToken: "" }));
  });
});
