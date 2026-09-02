// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextConnectorPocPage } from "./TextConnectorPocPage";
import type { AppSettings, TextConnectorAccount, TextConnectorPocCatalogItem } from "./types";

const settings: AppSettings = {
  baseUrl: "https://api.example.test",
  companyId: "42",
  apiToken: "",
  accessToken: "admin-jwt",
  userRole: "Admin",
};

const catalog: TextConnectorPocCatalogItem[] = [
  {
    provider: "chat2desk",
    displayName: "Chat2Desk",
    documentationUrl: "https://docs.example.test/chat2desk",
    messageEvents: ["inbox"],
    conversationEvents: ["close_dialog"],
    supportsHistoryApi: true,
    historyValidationNote: "History supported.",
    securityValidationNote: "Validate signing.",
  },
  {
    provider: "trengo",
    displayName: "Trengo",
    documentationUrl: "https://docs.example.test/trengo",
    messageEvents: ["INBOUND"],
    conversationEvents: ["TICKET_CLOSED"],
    supportsHistoryApi: true,
    historyValidationNote: "History supported.",
    securityValidationNote: "Validate signing.",
  },
  {
    provider: "chatwoot",
    displayName: "Chatwoot",
    documentationUrl: "https://docs.example.test/chatwoot",
    messageEvents: ["message_created"],
    conversationEvents: ["conversation_created"],
    supportsHistoryApi: false,
    historyValidationNote: "Manual history validation.",
    securityValidationNote: "Validate signing.",
  },
];

const firstAccount: TextConnectorAccount = {
  accountId: "account-1",
  provider: "chat2desk",
  displayName: "Support Inbox",
  idleTimeoutMinutes: 30,
  enabled: true,
  version: 7,
  lastReceivedAt: "2026-08-31T12:00:00Z",
};

const secondAccount: TextConnectorAccount = {
  accountId: "account-2",
  provider: "chat2desk",
  displayName: "Sales Inbox",
  idleTimeoutMinutes: 45,
  enabled: false,
  version: 3,
  lastReceivedAt: null,
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

type MockOptions = {
  accounts?: TextConnectorAccount[];
  updateConflict?: boolean;
  catalogStatus?: number;
};

const mockApi = (options: MockOptions = {}) => {
  let accounts = options.accounts ?? [firstAccount, secondAccount];
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });

    if (url.endsWith("/api/v1/admin/text-connectors/poc/catalog")) {
      return options.catalogStatus
        ? json({ message: options.catalogStatus === 401 ? "Expired" : "Forbidden" }, options.catalogStatus)
        : json({ items: catalog });
    }
    if (url.endsWith("/api/v1/admin/text-connectors/accounts") && init?.method === "POST") {
      const inputBody = JSON.parse(String(init.body));
      const account = { ...firstAccount, accountId: "account-3", version: 1, ...inputBody };
      accounts = [...accounts, account];
      return json({ account, webhookUrl: "https://hooks.example.test/account-3", webhookKey: "one-time-secret" }, 201);
    }
    if (url.endsWith("/api/v1/admin/text-connectors/accounts")) return json({ items: accounts });
    if (url.endsWith("/account-1/rotate-webhook-key") && init?.method === "POST") {
      return json({ account: firstAccount, webhookUrl: "https://hooks.example.test/account-1", webhookKey: "rotated-secret" });
    }
    if (url.endsWith("/account-1") && init?.method === "PUT") {
      if (options.updateConflict) {
        accounts = [{ ...firstAccount, displayName: "Changed elsewhere", version: 8 }, secondAccount];
        return json({ message: "Version mismatch." }, 409);
      }
      const inputBody = JSON.parse(String(init.body));
      accounts = [{ ...firstAccount, ...inputBody, version: firstAccount.version + 1 }, secondAccount];
      return json(accounts[0]);
    }
    return json({ message: "Not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requests };
};

const renderPage = (onUnauthorized = vi.fn()) => {
  render(<TextConnectorPocPage settings={settings} onUnauthorized={onUnauthorized} />);
  return onUnauthorized;
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("text connector accounts", () => {
  it("lists multiple accounts per provider and shows webhook activity", async () => {
    mockApi();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Text Connectors" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Support Inbox" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sales Inbox" })).toBeTruthy();
    expect(screen.getByText("No webhook activity yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /test connection/i })).toBeNull();
  });

  it("creates a disabled account and removes the one-time key when its dialog closes", async () => {
    const { requests } = mockApi({ accounts: [] });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("heading", { name: "Text Connectors" });

    await user.click(screen.getAllByRole("button", { name: "Create account" })[0]);
    expect(screen.getByRole("switch", { name: "Enabled" })).toHaveProperty("checked", false);
    await user.selectOptions(screen.getByLabelText("Provider *"), "trengo");
    await user.type(screen.getByLabelText("Display name *"), "Trengo Support");
    await user.clear(screen.getByLabelText("Idle timeout (minutes) *"));
    await user.type(screen.getByLabelText("Idle timeout (minutes) *"), "20");
    const formCard = screen.getByRole("heading", { name: "Create text connector" }).closest("section")!;
    await user.click(within(formCard).getByRole("button", { name: "Create account" }));

    const dialog = await screen.findByRole("dialog", { name: "Save the webhook key now" });
    expect(within(dialog).getByText("one-time-secret")).toBeTruthy();
    const post = requests.find((request) => request.init?.method === "POST" && request.url.endsWith("/accounts"));
    expect(JSON.parse(String(post?.init?.body))).toEqual({ provider: "trengo", displayName: "Trengo Support", idleTimeoutMinutes: 20, enabled: false });

    await user.click(within(dialog).getByRole("button", { name: "I saved the key" }));
    expect(screen.queryByText("one-time-secret")).toBeNull();
    const localValues = Array.from({ length: localStorage.length }, (_, index) => localStorage.getItem(localStorage.key(index) ?? ""));
    const sessionValues = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.getItem(sessionStorage.key(index) ?? ""));
    expect(JSON.stringify(localValues)).not.toContain("one-time-secret");
    expect(JSON.stringify(sessionValues)).not.toContain("one-time-secret");
  });

  it("uses the latest expectedVersion when editing and enabling accounts", async () => {
    const { requests } = mockApi();
    const user = userEvent.setup();
    renderPage();
    const heading = await screen.findByRole("heading", { name: "Support Inbox" });
    const card = heading.closest("article")!;

    await user.click(within(card).getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Display name *"));
    await user.type(screen.getByLabelText("Display name *"), "Updated Support");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Text connector account updated.");

    const put = requests.find((request) => request.init?.method === "PUT");
    expect(JSON.parse(String(put?.init?.body))).toMatchObject({ displayName: "Updated Support", expectedVersion: 7 });

    const updatedCard = screen.getByRole("heading", { name: "Updated Support" }).closest("article")!;
    await user.click(within(updatedCard).getByRole("button", { name: "Disable" }));
    await screen.findByText("Account disabled.");
    const puts = requests.filter((request) => request.init?.method === "PUT");
    expect(JSON.parse(String(puts[1]?.init?.body))).toMatchObject({ enabled: false, expectedVersion: 8 });
  });

  it("reloads the latest account after a 409 conflict", async () => {
    mockApi({ updateConflict: true });
    const user = userEvent.setup();
    renderPage();
    const card = (await screen.findByRole("heading", { name: "Support Inbox" })).closest("article")!;
    await user.click(within(card).getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/modified elsewhere/)).toBeTruthy();
    expect(screen.getByLabelText("Display name *")).toHaveProperty("value", "Changed elsewhere");
  });

  it("shows a new one-time key after rotation", async () => {
    mockApi();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();
    const card = (await screen.findByRole("heading", { name: "Support Inbox" })).closest("article")!;
    await user.click(within(card).getByRole("button", { name: "Rotate webhook key" }));

    expect(await screen.findByText("rotated-secret")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close webhook setup" }));
    expect(screen.queryByText("rotated-secret")).toBeNull();
  });
});

describe("text connector authorization", () => {
  it("treats 401 as an expired session", async () => {
    mockApi({ catalogStatus: 401 });
    const onUnauthorized = renderPage();
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });

  it("renders permission denied for 403", async () => {
    mockApi({ catalogStatus: 403 });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Permission denied" })).toBeTruthy();
    expect(screen.getByText("Administrator access is required to manage text connectors.")).toBeTruthy();
  });
});
