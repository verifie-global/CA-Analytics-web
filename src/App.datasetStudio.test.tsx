// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App, { getRouteFromPath } from "./App";
import { I18nProvider } from "./i18n";
import { annotationOptionsFixture } from "./datasetStudio.testFixtures";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
type User = { id: number; companyId?: number | string | null; role: "Admin" | "User"; agentIds: number[] };
function setup(options: { companyId?: number | string | null; role?: "Admin" | "User"; selectedCompany?: string; partner?: boolean; deferMe?: Promise<void>; sessionStatus?: number } = {}) {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  const selectedCompany = options.selectedCompany ?? "1";
  let user: User = { id: 7, companyId: options.companyId === undefined ? 1 : options.companyId, role: options.role ?? "User", agentIds: [] };
  let annotationStatus = options.sessionStatus ?? 200;
  localStorage.setItem("ca-analytics-settings", JSON.stringify({ baseUrl: "https://api.example.test", companyId: selectedCompany, apiToken: options.partner ? "partner-token" : "", accessToken: "jwt-token", userId: 7, userRole: user.role, preferredLocale: "en" }));
  const clip = { id: "clip", recordingId: "recording", index: 1, startSeconds: 0, endSeconds: 12, originalText: "Original", text: "Saved transcript", status: "pending", note: null, revision: "revision", reviewedAt: null, reviewedByUserId: null, recordingDuration: 120, recordingName: "Support call", sourceCompanyId: 42, sourceCompanyName: "Source company" };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/auth/login")) return json({ accessToken: `jwt-user-${user.id}`, companyId: user.companyId, userId: user.id, role: user.role });
    if (url.endsWith("/api/auth/me")) { await options.deferMe; return json({ ...user, preferredLocale: "en" }); }
    if (url.includes("/annotation-sessions") && annotationStatus !== 200) return json({ detail: "Annotation access denied." }, annotationStatus);
    if (url.endsWith("/annotation-sessions/options")) return json(annotationOptionsFixture);
    if (url.endsWith("/annotation-sessions")) return json([{ id: "session", name: "Training calls", provider: "gcp", model: "chirp_3", language: "hy", createdAt: "2026-10-26T10:00:00Z", recordings: 1, readyRecordings: 1, failedRecordings: 0, clips: 1, verified: 0, rejected: 0 }]);
    if (url.includes("/annotation-sessions/session/clips?")) return json({ items: [clip], total: 1, page: 1, pageSize: 50 });
    if (url.includes("/annotation-sessions/session/clips/clip/audio?")) return new Response("wav", { headers: { "Content-Type": "audio/wav" } });
    if (url.endsWith("/annotation-sessions/session")) return json({ id: "session", name: "Training calls", provider: "gcp", model: "chirp_3", language: "hy", minClipSeconds: 10, maxClipSeconds: 15, createdAt: "2026-10-26T10:00:00Z", recordings: [{ id: "recording", conversationId: 1, name: "Support call", companyId: 42, companyName: "Source company", status: "ready", error: null, durationSeconds: 120, originalTranscript: "Original", clips: 1, verified: 0, rejected: 0 }] });
    if (url.endsWith("/users")) return json({ items: [] }, user.role === "Admin" ? 200 : 403);
    if (url.endsWith("/localization/options")) return json({ defaultLocale: "en", supportedLocales: [{ code: "en", englishName: "English", nativeName: "English", textDirection: "ltr" }] });
    if (url.includes("/calls/filter-options")) return json({ agents: [], customers: [] });
    if (url.includes("/calls?")) return json({ items: [], page: 1, pageSize: 10, total: 0 });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:audio") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
  return { fetchMock, setUser: (value: User) => { user = value; }, denyAnnotations: () => { annotationStatus = 403; }, annotationCalls: () => fetchMock.mock.calls.filter(([input]) => String(input).includes("/annotation-sessions")) };
}

afterEach(() => {
  cleanup(); localStorage.clear(); sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("Dataset Studio company-1 access policy", () => {
  it.each(["Admin", "User"] as const)("allows a server-validated company-1 %s without agent assignments", async (role) => {
    const api = setup({ role, selectedCompany: "42" });
    const user = userEvent.setup();
    render(<I18nProvider><App /></I18nProvider>);
    await user.click(await screen.findByRole("button", { name: "Dataset Studio" }));
    expect(window.location.pathname).toBe("/dataset-studio");
    await user.click(await screen.findByRole("button", { name: "Open session" }));
    expect(await screen.findByLabelText("Corrected transcript")).toBeTruthy();
    expect(api.annotationCalls().every(([url]) => String(url).includes("/api/companies/1/annotation-sessions"))).toBe(true);
    if (role === "User") expect(screen.queryByRole("button", { name: "TEXT CONNECTORS" })).toBeNull();
  });

  it("does not render annotation links, controls, or requests while server authentication is loading", async () => {
    let resolveMe!: () => void;
    const api = setup({ partner: true, deferMe: new Promise<void>((resolve) => { resolveMe = resolve; }) });
    window.history.replaceState({}, "", "/dataset-studio");
    render(<I18nProvider><App /></I18nProvider>);
    await waitFor(() => expect(api.fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/auth/me"))).toBe(true));
    expect(screen.queryByRole("button", { name: "Dataset Studio" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Dataset Studio" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create session" })).toBeNull();
    expect(api.annotationCalls()).toHaveLength(0);
    await act(async () => resolveMe());
    expect(await screen.findByRole("heading", { name: "Dataset Studio" })).toBeTruthy();
  });

  it.each([2, "42", "01", "1 ", null])("denies company %s despite a locally selected company 1 and redirects direct URLs", async (companyId) => {
    const api = setup({ companyId, role: "Admin", selectedCompany: "1", partner: true });
    window.history.replaceState({}, "", "/dataset-studio");
    render(<I18nProvider><App /></I18nProvider>);
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(screen.queryByRole("button", { name: "Dataset Studio" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Dataset Studio" })).toBeNull();
    expect(api.annotationCalls()).toHaveLength(0);
    expect(await screen.findByRole("button", { name: "TEXT CONNECTORS" })).toBeTruthy();
  });

  it("retains drafts during app navigation within the same account", async () => {
    setup();
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/dataset-studio/");
    expect(getRouteFromPath(window.location.pathname)).toBe("dataset-studio");
    render(<I18nProvider><App /></I18nProvider>);
    await user.click(await screen.findByRole("button", { name: "Open session" }));
    fireEvent.change(await screen.findByLabelText("Corrected transcript"), { target: { value: "Հայերեն local draft" } });
    await user.click(screen.getByRole("button", { name: "Reports" }));
    await user.click(screen.getByRole("button", { name: "Dataset Studio" }));
    expect((await screen.findByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toBe("Հայերեն local draft");
  });

  it("revokes annotation access on 403, stops audio, clears drafts, and protects later direct URLs", async () => {
    const api = setup();
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/dataset-studio");
    render(<I18nProvider><App /></I18nProvider>);
    await user.click(await screen.findByRole("button", { name: "Open session" }));
    fireEvent.change(await screen.findByLabelText("Corrected transcript"), { target: { value: "Private draft" } });
    await screen.findByLabelText("Clip audio preview");
    api.denyAnnotations();
    await user.click(screen.getByRole("button", { name: "Refresh clips" }));
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(screen.queryByRole("button", { name: "Dataset Studio" })).toBeNull();
    expect(screen.queryByLabelText("Clip audio preview")).toBeNull();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio");
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    const count = api.annotationCalls().length;
    act(() => { window.history.pushState({}, "", "/dataset-studio"); window.dispatchEvent(new PopStateEvent("popstate")); });
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(api.annotationCalls()).toHaveLength(count);
  });

  it("clears caches and audio on logout, denies another company, and gives a new annotator a fresh workspace", async () => {
    const api = setup();
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/dataset-studio");
    render(<I18nProvider><App /></I18nProvider>);
    await user.click(await screen.findByRole("button", { name: "Open session" }));
    fireEvent.change(await screen.findByLabelText("Corrected transcript"), { target: { value: "Account A private draft" } });
    await screen.findByLabelText("Clip audio preview");
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio");
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    const login = async () => {
      await user.clear(screen.getByLabelText("Company ID"));
      await user.clear(screen.getByLabelText("Email"));
      await user.clear(screen.getByLabelText("Password"));
      await user.type(screen.getByLabelText("Company ID"), "1");
      await user.type(screen.getByLabelText("Email"), "reviewer@example.test");
      await user.type(screen.getByLabelText("Password"), "password1");
      await user.click(screen.getByRole("button", { name: "Sign in" }));
      await screen.findByRole("button", { name: "Log out" });
    };
    api.setUser({ id: 8, companyId: 2, role: "User", agentIds: [11] });
    const callsBefore = api.annotationCalls().length;
    await login();
    expect(screen.queryByRole("button", { name: "Dataset Studio" })).toBeNull();
    expect(api.annotationCalls()).toHaveLength(callsBefore);
    await user.click(screen.getByRole("button", { name: "Log out" }));
    api.setUser({ id: 9, companyId: 1, role: "User", agentIds: [999] });
    await login();
    await user.click(await screen.findByRole("button", { name: "Dataset Studio" }));
    expect(await screen.findByRole("button", { name: "Open session" })).toBeTruthy();
    expect(screen.queryByText(/unsaved clip draft/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open session" }));
    expect((await screen.findByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toBe("Saved transcript");
  });

  it("keeps the existing expired-session sign-in flow", async () => {
    setup({ sessionStatus: 401 });
    window.history.replaceState({}, "", "/dataset-studio");
    render(<I18nProvider><App /></I18nProvider>);
    await screen.findByText("Your session expired. Please sign in again.");
    expect(JSON.parse(localStorage.getItem("ca-analytics-settings")!)).toMatchObject({ companyId: "", accessToken: "" });
  });
});
