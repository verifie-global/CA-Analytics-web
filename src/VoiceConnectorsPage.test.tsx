// @vitest-environment jsdom
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceConnectorsPage } from "./VoiceConnectorsPage";
import type {
  AppSettings,
  VoiceConnectorAccount,
  VoiceConnectorCatalogItem,
  VoiceConnectorTestStatus,
} from "./types";

const settings: AppSettings = {
  baseUrl: "https://api.example.test",
  companyId: "42",
  apiToken: "",
  accessToken: "access-token",
  userRole: "admin",
};

const whatsapp: VoiceConnectorCatalogItem = {
  provider: "whatsapp",
  display_name: "WhatsApp Business Calling",
  readiness: "available",
  runtime_activation_supported: true,
  description: "Handle customer calls through Meta.",
  fields: [
    {
      name: "api_version", label: "Meta API version", type: "text", required: true,
      secret: false, description: "Version used for Graph API calls.", placeholder: "v24.0",
    },
    {
      name: "media_gateway_base_uri", label: "Media gateway URL", type: "url", required: true,
      secret: false, placeholder: "https://media.example.test/",
    },
    {
      name: "retry_count", label: "Retry count", type: "number", required: false,
      secret: false, default_value: 3,
    },
    {
      name: "auto_pre_accept", label: "Auto pre-accept", type: "boolean", required: false,
      secret: false, default_value: true,
    },
    {
      name: "region", label: "Region", type: "select", required: true, secret: false,
      allowed_values: ["us", "eu"], default_value: "us",
    },
    {
      name: "access_token", label: "Access token", type: "password", required: true,
      secret: true, description: "Meta system-user access token.",
    },
  ],
};

const account: VoiceConnectorAccount = {
  provider: "whatsapp",
  display_name: "Production WhatsApp",
  enabled: true,
  configuration: {
    api_version: "v24.0",
    media_gateway_base_uri: "https://media.example.test/",
    retry_count: 3,
    auto_pre_accept: true,
    region: "us",
  },
  secret_fields: { access_token: true },
  configuration_version: 2,
  last_test: { status: "connected", message: "Connection verified.", tested_at: "2026-08-18T10:00:00Z" },
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

type ApiOptions = {
  catalog?: VoiceConnectorCatalogItem[];
  accounts?: VoiceConnectorAccount[];
  account?: VoiceConnectorAccount;
  putResponse?: Response | VoiceConnectorAccount;
  testStatus?: VoiceConnectorTestStatus;
};

const mockApi = (options: ApiOptions = {}) => {
  const catalog = options.catalog ?? [whatsapp];
  const accounts = options.accounts ?? [account];
  const selectedAccount = options.account ?? account;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith("/api/v1/admin/connectors/catalog")) return json(catalog);
    if (url.endsWith("/api/v1/admin/connectors/")) return json(accounts);
    if (url.includes("/audit?")) return json({ items: [{
      id: 1, action: "configuration_updated", actor: "admin@example.test",
      occurred_at: "2026-08-18T09:00:00Z", changed_fields: ["api_version"], trace_id: "trace-123",
    }] });
    if (url.endsWith("/test") && init?.method === "POST") {
      const status = options.testStatus ?? "connected";
      return json({ status, message: `Safe ${status} message.`, tested_at: "2026-08-18T10:00:00Z" });
    }
    if (url.endsWith("/api/v1/admin/connectors/whatsapp") && init?.method === "PUT") {
      return options.putResponse instanceof Response
        ? options.putResponse
        : json(options.putResponse ?? { ...selectedAccount, configuration_version: 3 });
    }
    if (url.endsWith("/api/v1/admin/connectors/whatsapp")) return json(selectedAccount);
    return json({ message: "Not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requests };
};

const renderPage = (onUnauthorized = vi.fn()) => {
  render(<VoiceConnectorsPage settings={settings} onUnauthorized={onUnauthorized} />);
  return onUnauthorized;
};

const waitForPage = async () => {
  await screen.findByRole("heading", { name: "Connector settings" }, { timeout: 10_000 });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VoiceConnectorsPage dynamic catalog", () => {
  it("renders every supported dynamic field type from the provider catalog", async () => {
    mockApi();
    renderPage();
    await waitForPage();

    expect(screen.getByLabelText("Meta API version *")).toHaveProperty("type", "text");
    expect(screen.getByLabelText("Media gateway URL *")).toHaveProperty("type", "url");
    expect(screen.getByLabelText("Retry count")).toHaveProperty("type", "number");
    expect(screen.getByLabelText("Auto pre-accept")).toHaveProperty("role", "switch");
    expect(screen.getByLabelText("Region *")).toHaveProperty("tagName", "SELECT");
    expect(screen.getByRole("option", { name: "eu" })).toBeTruthy();
    expect(screen.getByLabelText("Access token *")).toHaveProperty("type", "password");
  });

  it("provides programmatic labels, descriptions, required state, and keyboard focus", async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();
    await waitForPage();

    const apiVersion = screen.getByLabelText("Meta API version *");
    expect(apiVersion.getAttribute("required")).not.toBeNull();
    expect(apiVersion.getAttribute("aria-describedby")).toContain("description");
    await user.tab();
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole("switch", { name: "Enabled" })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
  });
});

describe("VoiceConnectorsPage credential safety", () => {
  it("masks stored secrets and omits unchanged credentials from updates", async () => {
    const { requests } = mockApi();
    const user = userEvent.setup();
    renderPage();
    await waitForPage();

    const secret = screen.getByLabelText("Access token *") as HTMLInputElement;
    expect(secret.value).toBe("");
    expect(secret.placeholder).toBe("Configured — leave blank to keep");
    expect(screen.getAllByText("Configured").length).toBeGreaterThan(1);
    expect(document.body.textContent).not.toContain("stored-secret-value");

    await user.clear(screen.getByLabelText("Display name *"));
    await user.type(screen.getByLabelText("Display name *"), "Updated WhatsApp");
    await user.click(screen.getByRole("button", { name: "Save connector" }));
    await screen.findByText("Connector configuration saved.");

    const put = requests.find((request) => request.init?.method === "PUT");
    const body = JSON.parse(String(put?.init?.body));
    expect(body.secrets).toEqual({});
    expect(body.clear_secrets).toEqual([]);
    expect(body.expected_version).toBe(2);
    expect((screen.getByLabelText("Access token *") as HTMLInputElement).value).toBe("");
  });

  it("only includes a configured secret in clear_secrets after explicit confirmation", async () => {
    const { requests } = mockApi();
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await waitForPage();

    await user.click(screen.getByLabelText("Clear stored credential"));
    expect(screen.getByLabelText("Access token *")).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("switch", { name: "Enabled" }));
    await user.click(screen.getByRole("button", { name: "Save connector" }));
    await screen.findByText("Connector configuration saved.");

    const put = requests.find((request) => request.init?.method === "PUT");
    expect(JSON.parse(String(put?.init?.body)).clear_secrets).toEqual(["access_token"]);
  });

  it("preserves non-secret edits after a failed save and redacts entered credentials from errors", async () => {
    const secretValue = "top-secret-value";
    mockApi({ putResponse: json({
      message: "Validation failed.",
      errors: {
        configuration: { api_version: "This API version is unsupported." },
        secrets: { access_token: `Credential ${secretValue} was rejected.` },
      },
    }, 400) });
    const user = userEvent.setup();
    renderPage();
    await waitForPage();

    await user.clear(screen.getByLabelText("Meta API version *"));
    await user.type(screen.getByLabelText("Meta API version *"), "v25.0");
    await user.type(screen.getByLabelText("Access token *"), secretValue);
    await user.click(screen.getByRole("button", { name: "Save connector" }));
    await waitFor(() => expect(document.body.textContent).toContain("[credential redacted]"));
    expect(document.body.textContent).not.toContain(secretValue);
    expect(screen.getByText("This API version is unsupported.")).toBeTruthy();
    expect(screen.getByLabelText("Meta API version *").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Meta API version *")).toHaveProperty("value", "v25.0");
  });
});

describe("VoiceConnectorsPage validation and activation", () => {
  it("requires configuration and credentials before enabling a connector", async () => {
    const unsavedAccountList: VoiceConnectorAccount[] = [];
    const emptyCatalog: VoiceConnectorCatalogItem[] = [{
      ...whatsapp,
      fields: whatsapp.fields.map((field) => ({ ...field, default_value: null })),
    }];
    const { requests } = mockApi({ catalog: emptyCatalog, accounts: unsavedAccountList });
    const user = userEvent.setup();
    renderPage();
    await waitForPage();

    await user.click(screen.getByRole("switch", { name: "Enabled" }));
    await user.click(screen.getByRole("button", { name: "Save connector" }));

    expect(await screen.findByText("Meta API version is required before activation.")).toBeTruthy();
    expect(screen.getByText("Access token is required before activation.")).toBeTruthy();
    expect(requests.some((request) => request.init?.method === "PUT")).toBe(false);
  });

  it("locks activation and always saves unavailable adapters as disabled", async () => {
    const adapter = { ...whatsapp, readiness: "adapter_required", runtime_activation_supported: false, limitation: "Install the SIP adapter." };
    const { requests } = mockApi({ catalog: [adapter], account: { ...account, enabled: true }, accounts: [{ ...account, enabled: true }] });
    const user = userEvent.setup();
    renderPage();
    await waitForPage();

    expect(screen.getByRole("switch", { name: "Enabled" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Production adapter required")).toBeTruthy();
    expect(screen.getByText("Install the SIP adapter.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save connector" }));
    await screen.findByText("Connector configuration saved.");
    const put = requests.find((request) => request.init?.method === "PUT");
    expect(JSON.parse(String(put?.init?.body)).enabled).toBe(false);
  });
});

describe("VoiceConnectorsPage request failures", () => {
  it("shows a 409 conflict without overwriting and offers an explicit reload", async () => {
    const { requests } = mockApi({ putResponse: json({ message: "Version mismatch." }, 409) });
    const user = userEvent.setup();
    renderPage();
    await waitForPage();
    await user.click(screen.getByRole("button", { name: "Save connector" }));

    expect(await screen.findByText(/Another administrator changed this connector/)).toBeTruthy();
    const reload = screen.getByRole("button", { name: "Reload latest configuration" });
    expect(reload).toBeTruthy();
    const getCount = requests.filter((request) => request.url.endsWith("/whatsapp") && !request.init?.method).length;
    await user.click(reload);
    await waitFor(() => expect(requests.filter((request) => request.url.endsWith("/whatsapp") && !request.init?.method).length).toBeGreaterThan(getCount));
  });

  it("treats 401 as an expired session", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/catalog") ? json({ message: "Expired" }, 401) : json([])));
    renderPage(onUnauthorized);
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });

  it("renders the access-denied screen for HTTP 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/catalog") ? json({ message: "Forbidden" }, 403) : json([])));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Permission denied" })).toBeTruthy();
    expect(screen.getByText("Administrator access is required to manage voice connectors.")).toBeTruthy();
  });
});

describe("VoiceConnectorsPage connection testing", () => {
  it.each([
    "connected",
    "credentials_rejected",
    "unavailable",
    "timeout",
    "adapter_required",
  ] as VoiceConnectorTestStatus[])("displays the %s test state safely", async (status) => {
    mockApi({ testStatus: status });
    const user = userEvent.setup();
    renderPage();
    await waitForPage();
    const button = screen.getByRole("button", { name: "Test connection" });
    expect(button).toHaveProperty("disabled", false);
    await user.click(button);
    expect(await screen.findByText(status === "adapter_required" ? "The production adapter must be installed before this connector can be tested." : `Safe ${status} message.`)).toBeTruthy();
    expect(screen.getAllByText(status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())).length).toBeGreaterThan(0);
  });

  it("keeps connection testing disabled until the connector is saved", async () => {
    mockApi({ accounts: [] });
    renderPage();
    await waitForPage();
    expect(screen.getByRole("button", { name: "Test connection" })).toHaveProperty("disabled", true);
  });
});

describe("VoiceConnectorsPage responsive end-to-end flow", () => {
  it("contains explicit tablet and mobile layout adaptations", async () => {
    const stylesCss = readFileSync("src/styles.css", "utf8");
    expect(stylesCss).toContain("@media (max-width: 780px)");
    expect(stylesCss).toMatch(/\.voice-connectors-layout\s*\{\s*grid-template-columns:\s*1fr/);
    expect(stylesCss).toContain("@media (max-width: 520px)");
    mockApi();
    const { container } = render(<VoiceConnectorsPage settings={settings} onUnauthorized={vi.fn()} />);
    await waitForPage();
    expect(container.querySelector(".voice-connectors-layout")).toBeTruthy();
  });

  it("configures and tests WhatsApp using mocked API responses", async () => {
    const { requests } = mockApi({ accounts: [] });
    const user = userEvent.setup();
    renderPage();
    await waitForPage();

    await user.clear(screen.getByLabelText("Meta API version *"));
    await user.type(screen.getByLabelText("Meta API version *"), "v24.0");
    await user.clear(screen.getByLabelText("Media gateway URL *"));
    await user.type(screen.getByLabelText("Media gateway URL *"), "https://media.example.test/");
    await user.selectOptions(screen.getByLabelText("Region *"), "eu");
    await user.type(screen.getByLabelText("Access token *"), "new-secret");
    await user.click(screen.getByRole("switch", { name: "Enabled" }));
    await user.click(screen.getByRole("button", { name: "Save connector" }));
    await screen.findByText("Connector configuration saved.");

    const put = requests.find((request) => request.init?.method === "PUT");
    const body = JSON.parse(String(put?.init?.body));
    expect(body).toMatchObject({
      enabled: true,
      configuration: { api_version: "v24.0", media_gateway_base_uri: "https://media.example.test/", region: "eu" },
      secrets: { access_token: "new-secret" },
      clear_secrets: [],
      expected_version: 0,
    });
    expect((screen.getByLabelText("Access token *") as HTMLInputElement).value).toBe("");

    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("Safe connected message.")).toBeTruthy();
    const audit = screen.getByRole("table");
    expect(within(audit).getByText("Configuration Updated")).toBeTruthy();
    expect(within(audit).getByText("trace-123")).toBeTruthy();
  }, 15_000);
});
