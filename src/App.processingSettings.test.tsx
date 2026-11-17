// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App, { getRouteFromPath } from "./App";
import { I18nProvider, LOCALE_STORAGE_KEY } from "./i18n";

const route = "/admin/processing-settings";
const settingsEndpoint = "https://api.example.test/api/companies/42/processing-settings";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
});

const stage = {
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

function mockApi(userRole: string, userId: string, adminProbeStatus: number) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/me")) {
      return userId
        ? json({ companyId: 42, companyName: "SatisfAI", userRole, userId: Number(userId), preferredLocale: "en" })
        : json({ message: "Forbidden" }, 403);
    }
    if (url === settingsEndpoint || url.startsWith(`${settingsEndpoint}?`)) {
      return json({
        companyId: 42,
        version: 3,
        sttProvider: "custom",
        stt: stage,
        diarization: stage,
        redaction: { ...stage, defaultEngine: "builtin" },
        asrCorrection: stage,
        qaEvaluation: stage,
        analysis: stage,
      });
    }
    if (url.endsWith("/stt-settings")) {
      return json({ companyId: 42, provider: "custom", model: null, defaultLanguage: "auto", enableAudioEnhancement: true });
    }
    if (url.endsWith("/users")) return json({ items: [] }, adminProbeStatus);
    if (url.endsWith("/localization/options")) {
      return json({
        defaultLocale: "en",
        supportedLocales: [{ code: "en", englishName: "English", nativeName: "English", textDirection: "ltr" }],
      });
    }
    if (url.includes("/calls/filter-options")) return json({ agents: [], customers: [] });
    if (url.includes("/calls?")) return json({ items: [], page: 1, pageSize: 10, total: 0 });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function saveSession(userRole: string, apiToken: string, userId: string) {
  localStorage.setItem(LOCALE_STORAGE_KEY, "en");
  localStorage.setItem("ca-analytics-settings", JSON.stringify({
    baseUrl: "https://api.example.test",
    companyId: "42",
    accessToken: "existing-session-jwt",
    apiToken,
    userRole,
    userId,
    preferredLocale: "en",
  }));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Processing settings navigation and access", () => {
  it("opens from the admin navigation and loads through the existing company session", async () => {
    saveSession("Admin", "", "17");
    const fetchMock = mockApi("Admin", "17", 200);
    const user = userEvent.setup();

    render(<I18nProvider><App /></I18nProvider>);
    const nav = await screen.findByRole("navigation", undefined, { timeout: 5000 });
    const processing = await within(nav).findByRole("button", { name: /^Settings$/i }, { timeout: 5000 });
    await user.click(processing);
    expect(processing.classList.contains("nav-item-active")).toBe(true);

    expect(window.location.pathname).toBe(route);
    expect(getRouteFromPath(route)).toBe("processing-settings");
    expect(await screen.findByRole("heading", { name: /^Processing settings$/i }, { timeout: 5000 })).toBeTruthy();
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([request, init]) =>
        String(request).split("?")[0] === settingsEndpoint &&
        new Headers(init?.headers).get("Authorization") === "Bearer existing-session-jwt"
      )).toBe(true);
    }, { timeout: 5000 });
    expect(fetchMock.mock.calls.some(([request]) => String(request).includes("/api/auth/login"))).toBe(false);
  }, 10000);

  it.each([
    { credential: "staff member", role: "User", apiToken: "", userId: "18", probeStatus: 403 },
    { credential: "company API token", role: "Admin", apiToken: "partner-token", userId: "", probeStatus: 200 },
  ])("denies the direct settings route for a $credential", async ({ role, apiToken, userId, probeStatus }) => {
    saveSession(role, apiToken, userId);
    const fetchMock = mockApi(role, userId, probeStatus);
    window.history.replaceState({}, "", route);

    render(<I18nProvider><App /></I18nProvider>);

    expect(await screen.findByRole("heading", { name: /^Permission denied$/i }, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Settings$/i })).toBeNull();
    expect(fetchMock.mock.calls.some(([request]) => String(request).split("?")[0] === settingsEndpoint)).toBe(false);
  });
});
