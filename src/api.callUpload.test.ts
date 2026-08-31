import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadCall } from "./api";
import type { AppSettings } from "./types";

const settings: AppSettings = {
  baseUrl: "https://api.example.test/",
  companyId: "company-7",
  apiToken: "",
  accessToken: "jwt-token",
};

const acceptedResponse = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });

const getSubmittedForm = (fetchMock: ReturnType<typeof vi.fn>) => {
  const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(
    "https://api.example.test/api/companies/company-7/calls/chat%2Fpayment%2042",
  );
  expect(request.method).toBe("POST");
  expect(request.headers).toEqual({ Authorization: "Bearer jwt-token" });
  expect(request.headers).not.toHaveProperty("Content-Type");
  expect(request.body).toBeInstanceOf(FormData);
  return request.body as FormData;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("call analysis submission", () => {
  it("submits labeled and unlabeled transcript messages without a language override", async () => {
    const transcript = [
      "AGENT: Hello, how can I help?",
      "CUSTOMER: My payment failed.",
      "I see an error message.",
      "I will check your account.",
    ].join("\n");
    const fetchMock = vi.fn(async () =>
      acceptedResponse({
        conversationId: "chat/payment 42",
        conversationDbId: 918,
        status: "Queued",
        source: "transcript",
        detectedLanguage: "en",
        agentName: "Maya",
        customerName: "Aram",
        billSeconds: 75,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadCall(settings, {
      conversationId: "chat/payment 42",
      transcript,
      language: "auto",
      metadata: {
        agentName: "Maya",
        customerName: "Aram",
        billSeconds: 75,
      },
    });

    const form = getSubmittedForm(fetchMock);
    expect(form.get("transcript")).toBe(transcript);
    expect(form.has("language")).toBe(false);
    expect(form.get("agentName")).toBe("Maya");
    expect(form.get("customerName")).toBe("Aram");
    expect(form.get("billSeconds")).toBe("75");
    expect(form.has("audio")).toBe(false);
    expect(form.has("url")).toBe(false);
    expect(result).toMatchObject({
      conversationId: "chat/payment 42",
      conversationDbId: 918,
      status: "Queued",
      source: "transcript",
      language: "en",
      billSeconds: 75,
    });
  });

  it("appends an explicit language override and all optional metadata", async () => {
    const fetchMock = vi.fn(async () =>
      acceptedResponse({
        conversationId: "chat/payment 42",
        status: "Queued",
        source: "transcript",
        language: "ru",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await uploadCall(settings, {
      conversationId: "chat/payment 42",
      transcript: "Сообщение без метки",
      language: "ru",
      metadata: {
        agentName: "Анна",
        agentExternalId: "agent-1",
        agentPhone: "+10000000001",
        customerName: "Иван",
        customerExternalId: "customer-2",
        customerPhone: "+10000000002",
        isInbound: false,
        billSeconds: 0,
      },
    });

    const form = getSubmittedForm(fetchMock);
    expect(Object.fromEntries(form.entries())).toMatchObject({
      transcript: "Сообщение без метки",
      language: "ru",
      agentName: "Анна",
      agentExternalId: "agent-1",
      agentPhone: "+10000000001",
      customerName: "Иван",
      customerExternalId: "customer-2",
      customerPhone: "+10000000002",
      isInbound: "false",
      billSeconds: "0",
    });
  });

  it("keeps audio URL submission mutually exclusive and multipart", async () => {
    const fetchMock = vi.fn(async () =>
      acceptedResponse({
        conversationId: "chat/payment 42",
        status: "Queued",
        source: "audio",
        language: "hy",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadCall(settings, {
      conversationId: "chat/payment 42",
      url: "  https://media.example.test/call.mp3  ",
      language: "auto",
    });

    const form = getSubmittedForm(fetchMock);
    expect(form.get("url")).toBe("https://media.example.test/call.mp3");
    expect(form.has("audio")).toBe(false);
    expect(form.has("transcript")).toBe(false);
    expect(form.has("language")).toBe(false);
    expect(result).toMatchObject({ source: "audio", language: "hy" });
  });

  it("rejects zero, multiple, and oversized transcript sources before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadCall(settings, { conversationId: "empty" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      uploadCall(settings, {
        conversationId: "multiple",
        url: "https://example.test/call.mp3",
        transcript: "Hello",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      uploadCall(settings, {
        conversationId: "too-long",
        transcript: "x".repeat(250_001),
      }),
    ).rejects.toThrow("250,000");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [400, { errors: { transcript: ["Transcript is invalid."] } }, "Invalid input: Transcript is invalid."],
    [401, { message: "expired" }, "Authentication expired or is invalid. Please sign in again."],
    [409, { message: "duplicate" }, "This conversation ID already exists. Generate a new ID and try again."],
  ])("maps HTTP %s to a clear upload error", async (status, body, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      uploadCall(settings, {
        conversationId: "chat/payment 42",
        transcript: "Hello",
      }),
    ).rejects.toMatchObject({ status, message });
  });
});
