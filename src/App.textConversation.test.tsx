// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { I18nProvider } from "./i18n";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

const saveSession = () => {
  localStorage.setItem("ca-analytics-settings", JSON.stringify({
    baseUrl: "https://api.example.test",
    companyId: "42",
    apiToken: "partner-token",
    accessToken: "jwt-token",
    userRole: "Admin",
    preferredLocale: "en",
  }));
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("text conversations", () => {
  it("renders text metadata and chat bubbles, then lets an administrator finalize collection", async () => {
    saveSession();
    let status = "Collecting";
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/api/localization/options")) return json({ defaultLocale: "en", supportedLocales: [{ code: "en", englishName: "English", nativeName: "English", textDirection: "ltr" }] });
      if (url.endsWith("/api/companies/42/users")) return json({ items: [] });
      if (url.includes("/calls/filter-options")) return json({ agents: [], customers: [] });
      if (url.includes("/qa-scoring-settings")) return json({});
      if (url.includes("/qa-profile")) return json({});
      if (url.endsWith("/accounts/account-1/conversations/text-1/finalize") && init?.method === "POST") {
        status = "Queued";
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/api/companies/42/calls/text-1")) {
        return json({
          conversationId: "text-1",
          conversationName: "Customer support chat",
          status,
          modality: "text",
          textConnectorAccountId: "account-1",
          sourceProvider: "Chat2Desk",
          sourceChannel: "Telegram",
          transcript: "CUSTOMER: My payment failed.\nAGENT: I can help with that.",
          segments: [],
          analysis: {},
        });
      }
      if (url.includes("/api/companies/42/calls?")) {
        return json({ items: [{
          conversationId: "text-1",
          conversationName: "Customer support chat",
          status,
          modality: "text",
          textConnectorAccountId: "account-1",
          sourceProvider: "Chat2Desk",
          sourceChannel: "Telegram",
          createdUtc: "2026-09-01T10:00:00Z",
        }], page: 1, pageSize: 10, total: 1 });
      }
      return json({});
    }));

    render(<I18nProvider><App /></I18nProvider>);

    const conversationName = await screen.findByText("Customer support chat", {}, { timeout: 10_000 });
    const row = conversationName.closest<HTMLElement>('[role="row"]')!;
    expect(within(row).getByText("Text")).toBeTruthy();
    expect(within(row).getByText("Chat2Desk · Telegram")).toBeTruthy();
    expect(within(row).getByText("Collecting")).toBeTruthy();
    fireEvent.click(row);

    expect(await screen.findByRole("button", { name: "Finalize and analyze" })).toBeTruthy();
    expect(screen.getAllByText("Customer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Agent").length).toBeGreaterThan(0);
    expect(screen.getByText("My payment failed.")).toBeTruthy();
    expect(screen.getByText("I can help with that.")).toBeTruthy();
    expect(screen.queryByTitle("Play")).toBeNull();
    expect(screen.queryByText("Emotional Timeline")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Finalize and analyze" }));
    await waitFor(() => expect(requests.some((request) => request.url.endsWith("/accounts/account-1/conversations/text-1/finalize") && request.init?.method === "POST")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Finalize and analyze" })).toBeNull());
  }, 20_000);
});
