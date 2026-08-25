import { afterEach, describe, expect, it, vi } from "vitest";
import {
  askCompanyCalls,
  askSingleCall,
  fetchCurrentUser,
  fetchLocalizationOptions,
  loginUser,
  updatePreferredLocale,
} from "./api";
import type { AppSettings, CallFilters } from "./types";

const settings: AppSettings = {
  baseUrl: "https://api.example.test/",
  companyId: "42",
  apiToken: "",
  accessToken: "access-token",
};

const filters: CallFilters = {
  page: 1, pageSize: 10, search: "", conversationId: "", createdFromUtc: "",
  createdToUtc: "", status: "", sentiment: "", minQaScore: "", maxQaScore: "",
  agentName: "", agentNames: [], agentExternalId: "", agentExternalIds: [],
  agentPhone: "", agentPhones: [], customerName: "", customerNames: [],
  customerExternalId: "", customerExternalIds: [], customerPhone: "", customerPhones: [],
};

afterEach(() => vi.restoreAllMocks());

describe("localization API contracts", () => {
  it("loads and normalizes UI localization options", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      defaultLocale: "hy-AM",
      supportedLocales: [
        { code: "en", englishName: "English", nativeName: "English", textDirection: "ltr" },
        { code: "hy-AM", englishName: "Armenian", nativeName: "Հայերեն", textDirection: "ltr" },
      ],
    }), { status: 200 }));

    const result = await fetchLocalizationOptions(settings.baseUrl);
    expect(result.defaultLocale).toBe("hy");
    expect(result.supportedLocales.map((locale) => locale.code)).toEqual(["en", "hy"]);
  });

  it("restores preferredLocale through auth/me and defaults missing values to English", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7, role: "Admin", preferredLocale: "ru" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7, role: "Admin", preferredLocale: null }), { status: 200 }));

    await expect(fetchCurrentUser(settings)).resolves.toMatchObject({ preferredLocale: "ru" });
    await expect(fetchCurrentUser(settings)).resolves.toMatchObject({ preferredLocale: "en" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.test/api/auth/me");
  });

  it("reads login preference and persists a preference update", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        accessToken: "jwt", companyId: 42, preferredLocale: "hy",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ preferredLocale: "ru" }), { status: 200 }));

    await expect(loginUser(settings, "person@example.test", "password1")).resolves.toMatchObject({ preferredLocale: "hy" });
    await expect(updatePreferredLocale(settings, "ru")).resolves.toBe("ru");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ preferredLocale: "ru" });
  });

  it("always sends responseLocale for company and single-call questions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({
        answer: "Պատասխան", evidence: [], responseLocale: "hy",
      }), { status: 200 }));

    await expect(askSingleCall(settings, "call-1", "Հարց", "hy")).resolves.toMatchObject({ responseLocale: "hy" });
    await askCompanyCalls(settings, filters, {
      question: "Հարց", responseLocale: "hy", maxCalls: 25,
      useSemanticSearch: false, semanticMaxCalls: 75,
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ question: "Հարց", responseLocale: "hy" });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ question: "Հարց", responseLocale: "hy" });
  });
});
