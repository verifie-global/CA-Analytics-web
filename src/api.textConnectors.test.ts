import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTextConnectorAccount,
  fetchTextConnectorAccounts,
  finalizeTextConnectorConversation,
  rotateTextConnectorWebhookKey,
  updateTextConnectorAccount,
} from "./api";
import type { AppSettings } from "./types";

const settings: AppSettings = {
  baseUrl: "https://api.example.test/",
  companyId: "42",
  apiToken: "",
  accessToken: "jwt-token",
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("text connector account API", () => {
  it("normalizes account aliases and supports multiple accounts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ accounts: [
      { id: "1", provider: "chat2desk", displayName: "Support", idleTimeoutMinutes: 30, isEnabled: true, configurationVersion: 4, lastReceivedAt: "2026-09-01T10:00:00Z" },
      { account_id: "2", provider: "chat2desk", display_name: "Sales", idle_timeout_minutes: 45, enabled: false, version: 2 },
    ] })));

    const result = await fetchTextConnectorAccounts(settings);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ accountId: "1", enabled: true, version: 4 });
    expect(result[1]).toMatchObject({ accountId: "2", displayName: "Sales", idleTimeoutMinutes: 45 });
  });

  it("creates accounts and returns the one-time webhook setup values", async () => {
    const fetchMock = vi.fn(async () => json({
      account: { accountId: "3", provider: "trengo", displayName: "Trengo", idleTimeoutMinutes: 20, enabled: false, version: 1 },
      webhookSetup: { webhookUrl: "https://hooks.example.test/3", webhookKey: "secret-once" },
    }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createTextConnectorAccount(settings, { provider: "trengo", displayName: "Trengo", idleTimeoutMinutes: 20, enabled: false });
    expect(result).toMatchObject({ webhookUrl: "https://hooks.example.test/3", webhookKey: "secret-once", account: { accountId: "3" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/admin/text-connectors/accounts",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer jwt-token", "Content-Type": "application/json" }) }),
    );
  });

  it("sends expectedVersion on updates and uses the key-rotation endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/rotate-webhook-key")) return json({ account: { accountId: "1", provider: "chat2desk", displayName: "Support", idleTimeoutMinutes: 30, enabled: true, version: 6 }, webhookKey: "rotated" });
      return json({ accountId: "1", provider: "chat2desk", displayName: "Support", idleTimeoutMinutes: 30, enabled: true, version: 6 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateTextConnectorAccount(settings, "account/1", { displayName: "Support", idleTimeoutMinutes: 30, enabled: true, expectedVersion: 5 });
    await rotateTextConnectorWebhookKey(settings, "account/1");
    const updateRequest = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(updateRequest[0]).toContain("accounts/account%2F1");
    expect(JSON.parse(String(updateRequest[1].body)).expectedVersion).toBe(5);
    expect(String(fetchMock.mock.calls[1][0])).toContain("accounts/account%2F1/rotate-webhook-key");
  });

  it("finalizes a text conversation with encoded identifiers", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await finalizeTextConnectorConversation(settings, "account/1", "conversation/7");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/admin/text-connectors/accounts/account%2F1/conversations/conversation%2F7/finalize",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer jwt-token" }) }),
    );
  });
});
