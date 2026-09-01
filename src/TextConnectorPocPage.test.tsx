// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextConnectorPocPage } from "./TextConnectorPocPage";
import type { AppSettings, TextConnectorPocCatalogItem } from "./types";

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
    messageEvents: ["inbox", "outbox", "imported_message"],
    conversationEvents: ["new_request", "close_dialog"],
    supportsHistoryApi: true,
    historyValidationNote: "Compare recent dialog messages with the replay result.",
    securityValidationNote: "Validate the live webhook secret outside this replay tool.",
  },
  {
    provider: "trengo",
    displayName: "Trengo",
    documentationUrl: "https://docs.example.test/trengo",
    messageEvents: ["INBOUND", "OUTBOUND"],
    conversationEvents: ["TICKET_CLOSED", "TICKET_REOPENED"],
    supportsHistoryApi: true,
    historyValidationNote: "Reconcile ticket history manually.",
    securityValidationNote: "Verify signatures against the live webhook.",
  },
  {
    provider: "chatwoot",
    displayName: "Chatwoot",
    documentationUrl: "https://docs.example.test/chatwoot",
    messageEvents: ["message_created", "message_updated"],
    conversationEvents: ["conversation_created", "conversation_status_changed"],
    supportsHistoryApi: false,
    historyValidationNote: "History API validation is unavailable in this lab.",
    securityValidationNote: "Validate webhook signing in the live receiver.",
  },
];

const normalizedResponse = {
  normalized: {
    provider: "chat2desk",
    eventId: "event-dedupe-1",
    eventType: "message_upserted",
    providerEventType: "inbox",
    externalConversationId: "601",
    externalMessageId: "501",
    channelId: "801",
    channel: "support",
    direction: "inbound",
    senderRole: "CUSTOMER",
    senderExternalId: "701",
    senderName: "Customer",
    occurredAt: "2026-09-01T10:00:00Z",
    text: "<img src=x onerror=alert(1)> Please help",
    attachments: [{ fileName: "invoice.pdf", contentType: "application/pdf", url: "https://files.example.test/invoice.pdf" }],
    requiresHydration: true,
    warnings: ["Sender phone was not provided."],
  },
  sourcePayload: { hook_type: "inbox", text: "<img src=x onerror=alert(1)> Please help" },
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type MockOptions = {
  catalogResponses?: Array<Response | Error>;
  normalizeResponses?: Array<Response | Error>;
};

const mockApi = (options: MockOptions = {}) => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  let catalogIndex = 0;
  let normalizeIndex = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith("/api/v1/admin/text-connectors/poc/catalog")) {
      const response = options.catalogResponses?.[catalogIndex++] ?? json(catalog);
      if (response instanceof Error) throw response;
      return response;
    }
    if (url.includes("/api/v1/admin/text-connectors/poc/") && url.endsWith("/normalize")) {
      const response = options.normalizeResponses?.[normalizeIndex++] ?? json(normalizedResponse);
      if (response instanceof Error) throw response;
      return response;
    }
    return json({ message: "Not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requests, fetchMock };
};

const renderPage = (onUnauthorized = vi.fn()) => {
  render(<TextConnectorPocPage settings={settings} onUnauthorized={onUnauthorized} />);
  return onUnauthorized;
};

const waitForCatalog = () => screen.findByRole("heading", { name: "Chat2Desk capabilities" });

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TextConnectorPocPage catalog and editor", () => {
  it("loads the backend catalog with provider events, validation notes, and docs", async () => {
    const { requests } = mockApi();
    renderPage();
    await waitForCatalog();

    expect(screen.getByRole("button", { name: /Chat2Desk/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Trengo/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Chatwoot/ })).toBeTruthy();
    expect(screen.getByText("imported_message")).toBeTruthy();
    expect(screen.getByText("close_dialog")).toBeTruthy();
    expect(screen.getByText("Compare recent dialog messages with the replay result.")).toBeTruthy();
    expect(screen.getByText("Validate the live webhook secret outside this replay tool.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Provider documentation/ })).toHaveProperty(
      "href",
      "https://docs.example.test/chat2desk",
    );
    expect(requests[0].init?.headers).toMatchObject({ Authorization: "Bearer admin-jwt" });
  });

  it("preserves independent drafts while switching providers", async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();
    await waitForCatalog();

    await user.click(screen.getByRole("button", { name: "Load Example" }));
    expect(screen.getByLabelText("Raw provider webhook JSON")).toHaveProperty(
      "value",
      expect.stringContaining('"hook_type": "inbox"'),
    );
    await user.click(screen.getByRole("button", { name: /Trengo/ }));
    await user.click(screen.getByRole("button", { name: "Load Example" }));
    expect(screen.getByLabelText("Raw provider webhook JSON")).toHaveProperty(
      "value",
      expect.stringContaining('"type": "OUTBOUND"'),
    );
    await user.click(screen.getByRole("button", { name: /Chat2Desk/ }));
    expect(screen.getByLabelText("Raw provider webhook JSON")).toHaveProperty(
      "value",
      expect.stringContaining('"hook_type": "inbox"'),
    );
    expect(localStorage.length).toBe(0);
  });

  it("keeps drafts for the current tab session without using localStorage", async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();
    await waitForCatalog();
    await user.click(screen.getByRole("button", { name: "Load Example" }));
    expect(sessionStorage.getItem("text-connector-poc-drafts:42")).toContain("hook_type");

    cleanup();
    renderPage();
    await waitForCatalog();
    expect(screen.getByLabelText("Raw provider webhook JSON")).toHaveProperty(
      "value",
      expect.stringContaining('"hook_type": "inbox"'),
    );
    expect(localStorage.length).toBe(0);
  });

  it("blocks invalid JSON and supports format, copy, and clear actions", async () => {
    mockApi();
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, "writeText");
    renderPage();
    await waitForCatalog();
    const editor = screen.getByLabelText("Raw provider webhook JSON");

    fireEvent.change(editor, { target: { value: '{"hook_type":' } });
    expect(screen.getByRole("button", { name: "Normalize webhook" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/Invalid JSON:/)).toBeTruthy();

    fireEvent.change(editor, { target: { value: '{"hook_type":"inbox"}' } });
    await user.click(screen.getByRole("button", { name: "Format JSON" }));
    expect(editor).toHaveProperty("value", '{\n  "hook_type": "inbox"\n}');
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(clipboardWrite).toHaveBeenCalledWith('{\n  "hook_type": "inbox"\n}');
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(editor).toHaveProperty("value", "");
  });

  it("keeps checklist state in memory independently for each provider", async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();
    await waitForCatalog();

    const customerCheck = screen.getByLabelText("Customer text received");
    await user.click(customerCheck);
    expect(customerCheck).toHaveProperty("checked", true);
    await user.click(screen.getByRole("button", { name: /Trengo/ }));
    expect(screen.getByLabelText("Customer text received")).toHaveProperty("checked", false);
    await user.click(screen.getByRole("button", { name: /Chat2Desk/ }));
    expect(screen.getByLabelText("Customer text received")).toHaveProperty("checked", true);
    expect(Object.keys(sessionStorage).some((key) => key.includes("checklist"))).toBe(false);
  });
});

describe("TextConnectorPocPage replay results and history", () => {
  it("renders a successful normalization, attachments, warnings, and safe text", async () => {
    const { requests } = mockApi();
    const user = userEvent.setup();
    renderPage();
    await waitForCatalog();
    await user.click(screen.getByRole("button", { name: "Load Example" }));
    await user.click(screen.getByRole("button", { name: "Normalize webhook" }));

    expect(await screen.findByRole("heading", { name: "Normalized result" })).toBeTruthy();
    expect(screen.getByText("Event: Message Upserted")).toBeTruthy();
    expect(screen.getByText("Direction: Inbound")).toBeTruthy();
    expect(screen.getByText("Sender: CUSTOMER")).toBeTruthy();
    expect(screen.getByText("invoice.pdf")).toBeTruthy();
    expect(screen.getByText("application/pdf")).toBeTruthy();
    expect(screen.getByText("Sender phone was not provided.")).toBeTruthy();
    expect(screen.getByText("<img src=x onerror=alert(1)> Please help")).toBeTruthy();
    expect(document.querySelector(".text-message-preview img")).toBeNull();
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getAllByText("event-dedupe-1").length).toBeGreaterThanOrEqual(2);

    const normalizeRequest = requests.find((request) => request.url.endsWith("/chat2desk/normalize"));
    expect(normalizeRequest?.init).toMatchObject({ method: "POST" });
    expect(normalizeRequest?.init?.headers).toMatchObject({
      Authorization: "Bearer admin-jwt",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(normalizeRequest?.init?.body))).toMatchObject({ hook_type: "inbox" });
  });

  it("marks later matching event IDs as duplicates and clears filtered history", async () => {
    mockApi({ normalizeResponses: [json(normalizedResponse), json(normalizedResponse)] });
    const user = userEvent.setup();
    renderPage();
    await waitForCatalog();
    await user.click(screen.getByRole("button", { name: "Load Example" }));
    const normalizeButton = screen.getByRole("button", { name: "Normalize webhook" });
    await user.click(normalizeButton);
    await screen.findByRole("heading", { name: "Normalized result" });
    await user.click(normalizeButton);

    const history = screen.getByRole("heading", { name: "Replay comparison" }).closest("section")!;
    expect(await within(history).findByText("Duplicate")).toBeTruthy();
    expect(within(history).getAllByText("event-dedupe-1")).toHaveLength(2);
    await user.selectOptions(within(history).getByLabelText("Provider"), "trengo");
    expect(within(history).getByText("No replay results match these filters.")).toBeTruthy();
    await user.click(within(history).getByRole("button", { name: "Clear History" }));
    expect(within(history).getByText("No replay history yet.")).toBeTruthy();
  });

  it("copies normalized JSON and the event ID", async () => {
    mockApi();
    const user = userEvent.setup();
    const clipboardWrite = vi.spyOn(navigator.clipboard, "writeText");
    renderPage();
    await waitForCatalog();
    await user.click(screen.getByRole("button", { name: "Load Example" }));
    await user.click(screen.getByRole("button", { name: "Normalize webhook" }));
    await screen.findByRole("heading", { name: "Normalized result" });

    await user.click(screen.getByRole("button", { name: "Copy event ID" }));
    expect(clipboardWrite).toHaveBeenCalledWith("event-dedupe-1");
    await user.click(screen.getByRole("button", { name: "Copy normalized JSON" }));
    expect(clipboardWrite).toHaveBeenLastCalledWith(
      expect.stringContaining('"eventId": "event-dedupe-1"'),
    );
  });
});

describe("TextConnectorPocPage API failures", () => {
  it("shows a clear 400 replay error and retry action", async () => {
    mockApi({ normalizeResponses: [json({ message: "Missing message identifier." }, 400)] });
    const user = userEvent.setup();
    renderPage();
    await waitForCatalog();
    await user.click(screen.getByRole("button", { name: "Load Example" }));
    await user.click(screen.getByRole("button", { name: "Normalize webhook" }));
    expect(await screen.findByText(/The provider payload is invalid.*Missing message identifier/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry normalize" })).toBeTruthy();
  });

  it("delegates HTTP 401 to the app session handler", async () => {
    mockApi({ catalogResponses: [json({ message: "Expired" }, 401)] });
    const onUnauthorized = renderPage();
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });

  it("shows the access-denied page for HTTP 403", async () => {
    mockApi({ catalogResponses: [json({ message: "Forbidden" }, 403)] });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Permission denied" })).toBeTruthy();
    expect(screen.getByText("Administrator access is required to use the Text Connector Lab.")).toBeTruthy();
  });

  it("handles a missing catalog endpoint and retries successfully", async () => {
    mockApi({ catalogResponses: [json({ message: "Not found" }, 404), json(catalog)] });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(/catalog endpoint was not found/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry catalog" }));
    expect(await screen.findByRole("heading", { name: "Chat2Desk capabilities" })).toBeTruthy();
  });

  it("shows a retryable network failure", async () => {
    mockApi({ catalogResponses: [new TypeError("Failed to fetch"), json(catalog)] });
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText(/service could not be reached/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry catalog" }));
    expect(await screen.findByRole("heading", { name: "Chat2Desk capabilities" })).toBeTruthy();
  });
});
