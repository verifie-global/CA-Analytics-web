// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUILTIN_LOCALIZATION_OPTIONS,
  I18nProvider,
  LOCALE_STORAGE_KEY,
  LanguageSelector,
  catalogs,
  persistLocaleOptimistically,
  resolveAuthenticatedLocale,
  resolvePreLoginLocale,
  sanitizeLocalizationOptions,
  useI18n,
} from "./i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.lang = "";
  document.documentElement.dir = "";
});

function Fixture() {
  const { t, formatNumber, formatPercent } = useI18n();
  return (
    <>
      <LanguageSelector />
      <h1>{t("Account")}</h1>
      <output>{formatNumber(12345.6)}</output>
      <output>{formatPercent(0.25)}</output>
    </>
  );
}

describe("locale resolution", () => {
  it("uses stored locale, then base browser locale, then backend default", () => {
    expect(resolvePreLoginLocale("ru", ["hy-AM"], BUILTIN_LOCALIZATION_OPTIONS)).toBe("ru");
    expect(resolvePreLoginLocale("invalid", ["hy-AM"], BUILTIN_LOCALIZATION_OPTIONS)).toBe("hy");
    expect(resolvePreLoginLocale(null, ["fr-FR"], {
      ...BUILTIN_LOCALIZATION_OPTIONS,
      defaultLocale: "ru",
    })).toBe("ru");
  });

  it("uses the authenticated preference and safely treats missing values as English", () => {
    expect(resolveAuthenticatedLocale("hy", "ru", BUILTIN_LOCALIZATION_OPTIONS)).toBe("hy");
    expect(resolveAuthenticatedLocale(null, "ru", BUILTIN_LOCALIZATION_OPTIONS)).toBe("en");
    expect(resolveAuthenticatedLocale("xx", "ru", BUILTIN_LOCALIZATION_OPTIONS)).toBe("ru");
  });

  it("sanitizes unavailable and invalid backend locale data", () => {
    expect(sanitizeLocalizationOptions(undefined)).toEqual(BUILTIN_LOCALIZATION_OPTIONS);
    expect(sanitizeLocalizationOptions({
      defaultLocale: "hy",
      supportedLocales: [],
    })).toEqual(BUILTIN_LOCALIZATION_OPTIONS);
  });

  it("keeps identical, non-empty keys in every catalog", () => {
    const englishKeys = Object.keys(catalogs.en).sort();
    expect(Object.keys(catalogs.hy).sort()).toEqual(englishKeys);
    expect(Object.keys(catalogs.ru).sort()).toEqual(englishKeys);
    englishKeys.forEach((key) => {
      expect(catalogs.en[key as keyof typeof catalogs.en]).not.toBe("");
      expect(catalogs.hy[key as keyof typeof catalogs.hy]).not.toBe("");
      expect(catalogs.ru[key as keyof typeof catalogs.ru]).not.toBe("");
    });
  });

  it("rolls an optimistic authenticated change back when persistence fails", async () => {
    const applied: string[] = [];
    await expect(persistLocaleOptimistically({
      previousLocale: "en",
      nextLocale: "hy",
      applyLocale: (locale) => applied.push(locale),
      persist: async () => { throw new Error("offline"); },
    })).rejects.toThrow("offline");
    expect(applied).toEqual(["hy", "en"]);
  });
});

describe("I18nProvider", () => {
  it("switches immediately, persists locally, formats values, and updates document metadata", async () => {
    const user = userEvent.setup();
    render(<I18nProvider><Fixture /></I18nProvider>);

    await user.selectOptions(screen.getByLabelText("Language"), "hy");

    await waitFor(() => expect(screen.getByRole("heading").textContent).toBe("Հաշիվ"));
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("hy");
    expect(document.documentElement.lang).toBe("hy");
    expect(document.documentElement.dir).toBe("ltr");
    expect(screen.getAllByRole("status").length).toBe(2);

    await user.selectOptions(screen.getByLabelText("Լեզու"), "ru");
    await waitFor(() => expect(screen.getByRole("heading").textContent).toBe("Аккаунт"));
    expect(document.documentElement.lang).toBe("ru");
  });

  it("renders each locale using its native name without flags", () => {
    render(<I18nProvider><LanguageSelector /></I18nProvider>);
    const labels = screen.getAllByRole("option").map((option) => option.textContent);
    expect(labels).toEqual(["English", "Հայերեն", "Русский"]);
  });
});
