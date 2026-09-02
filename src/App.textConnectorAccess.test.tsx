// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App, { getRouteFromPath } from "./App";
import { I18nProvider } from "./i18n";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const connectorCatalog = [{
  provider: "chat2desk",
  displayName: "Chat2Desk",
  documentationUrl: "https://docs.example.test/chat2desk",
  messageEvents: ["inbox"],
  conversationEvents: ["close_dialog"],
  supportsHistoryApi: true,
  historyValidationNote: "Manual history check.",
  securityValidationNote: "Manual security check.",
}];

const mockAppApi = (denyAdminProbe = false) => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/localization/options")) {
      return json({
        defaultLocale: "en",
        supportedLocales: [
          { code: "en", englishName: "English", nativeName: "English", textDirection: "ltr" },
        ],
      });
    }
    if (url.endsWith("/api/v1/admin/text-connectors/poc/catalog")) {
      return json(connectorCatalog);
    }
    if (url.endsWith("/api/v1/admin/text-connectors/accounts")) {
      return json({ items: [] });
    }
    if (url.endsWith("/api/companies/42/users")) {
      return denyAdminProbe ? json({ message: "Forbidden" }, 403) : json({ items: [] });
    }
    if (url.includes("/calls/filter-options")) return json({ agents: [], customers: [] });
    if (url.includes("/qa-scoring-settings")) return json({});
    if (url.includes("/calls")) return json({ items: [], page: 1, pageSize: 10, total: 0 });
    return json({});
  }));
};

const saveSession = (role: "Admin" | "User") => {
  localStorage.setItem("ca-analytics-settings", JSON.stringify({
    baseUrl: "https://api.example.test",
    companyId: "42",
    apiToken: "partner-token",
    accessToken: "jwt-token",
    userRole: role,
    preferredLocale: "en",
  }));
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Text connector admin navigation and routing", () => {
  it("maps the direct admin URL and shows the navigation item to administrators", async () => {
    saveSession("Admin");
    mockAppApi();
    window.history.replaceState({}, "", "/admin/text-connectors");

    render(<I18nProvider><App /></I18nProvider>);

    expect(getRouteFromPath(window.location.pathname)).toBe("text-connector-poc");
    expect(await screen.findByRole("heading", { name: "Text Connectors" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "TEXT CONNECTORS" })).toBeTruthy();
  });

  it("hides the navigation item and denies direct route access to non-admin users", async () => {
    saveSession("User");
    mockAppApi(true);
    window.history.replaceState({}, "", "/admin/text-connectors");

    render(<I18nProvider><App /></I18nProvider>);

    expect(await screen.findByRole("heading", { name: "Permission denied" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "TEXT CONNECTORS" })).toBeNull();
    expect(screen.getByText("Administrator access is required to manage text connectors.")).toBeTruthy();
  });
});
