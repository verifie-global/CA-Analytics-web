import { FormEvent, useEffect, useState } from "react";
import { useI18n, type TranslationKey } from "./i18n";
import type { CompanySttSettings, CompanySttSettingsUpdate, SttProvider } from "./types";

type SttSettingsPageProps = {
  companyId: string;
  isAdministrator: boolean;
  value: CompanySttSettings | null;
  loading: boolean;
  saving: boolean;
  errorMessage: string;
  successMessage: string;
  onSave: (update: CompanySttSettingsUpdate) => Promise<void>;
};

const languageOptions = [
  { value: "auto", label: "Automatic / multilingual (recommended)" },
  { value: "hy", label: "Armenian" },
  { value: "ru", label: "Russian" },
  { value: "en", label: "English" },
] as const;

const modelOptions = {
  gcp: ["chirp_3", "chirp_2", "chirp", "long", "short", "telephony", "telephony_short"],
  openai: [
    "gpt-transcribe",
    "gpt-4o-transcribe",
    "gpt-4o-mini-transcribe",
    "gpt-4o-mini-transcribe-2025-12-15",
    "gpt-4o-transcribe-diarize",
    "whisper-1",
  ],
};

const createDraft = (value: CompanySttSettings | null): CompanySttSettingsUpdate => ({
  provider: value?.provider ?? "custom",
  model: value?.model ?? null,
  defaultLanguage: value?.defaultLanguage?.trim() || "auto",
  enableAudioEnhancement: value?.enableAudioEnhancement ?? true,
});

export function SttSettingsPage({
  companyId,
  isAdministrator,
  value,
  loading,
  saving,
  errorMessage,
  successMessage,
  onSave,
}: SttSettingsPageProps) {
  const { t } = useI18n();
  const currentValue = value && String(value.companyId) === companyId ? value : null;
  const [draft, setDraft] = useState(() => createDraft(currentValue));

  useEffect(() => {
    setDraft(createDraft(currentValue));
  }, [currentValue, companyId]);

  const persisted = createDraft(currentValue);
  const isDirty = (Object.keys(persisted) as (keyof CompanySttSettingsUpdate)[])
    .some((key) => draft[key] !== persisted[key]);
  const { provider, model, defaultLanguage, enableAudioEnhancement } = draft;
  const choices = provider === "custom" ? [] : modelOptions[provider];
  const hasUnlistedModel = Boolean(model && !choices.includes(model));
  const hasUnlistedLanguage = !languageOptions.some((option) => option.value === defaultLanguage);
  const invalidModel = provider === "custom" && model !== null &&
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/.test(model);
  const disabled = loading || saving || !currentValue;
  const update = (change: Partial<CompanySttSettingsUpdate>) =>
    setDraft((previous) => ({ ...previous, ...change }));

  if (!isAdministrator) {
    return (
      <section className="panel permission-denied" role="alert">
        <h1>{t("Permission denied")}</h1>
        <p>{t((errorMessage || "Administrator access is required to view or edit speech-to-text settings.") as TranslationKey)}</p>
      </section>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled || !isDirty || invalidModel || !defaultLanguage.trim()) return;

    try {
      await onSave({ ...draft, defaultLanguage: defaultLanguage.trim() });
      // The returned API value, supplied by the parent, resets the draft.
    } catch {
      // Keep unsaved values; the parent exposes the API error in the form state.
    }
  };

  return (
    <section className="panel stt-settings-page" aria-busy={loading || saving}>
      <div className="section-heading">
        <h1>{t("STT Settings")}</h1>
        <p>{t("Choose how new audio is transcribed and prepared for analysis.")}</p>
      </div>

      {loading && !currentValue ? (
        <div className="empty-state" aria-live="polite">
          <h3>{t("Loading STT settings")}</h3>
          <p>{t("Fetching your company transcription defaults.")}</p>
        </div>
      ) : (
        <form className="stt-settings-form" onSubmit={submit} noValidate>
          <label className="stt-settings-field" htmlFor="stt-provider">
            <span>{t("Transcription provider")}</span>
            <select
              id="stt-provider"
              aria-label={t("Transcription provider")}
              value={provider}
              disabled={disabled}
              onChange={(event) => update({ provider: event.target.value as SttProvider, model: null })}
              aria-describedby="stt-provider-help"
            >
              <option value="custom">{t("SatisfAI STT service")}</option>
              <option value="gcp">Google Cloud</option>
              <option value="openai">OpenAI</option>
            </select>
            <small id="stt-provider-help">{t("This selection applies to new uploaded recordings and imported calls.")}</small>
          </label>

          <div className="stt-settings-field">
            <label htmlFor="stt-model">{t("Transcription model")}</label>
            {provider === "custom" ? (
              <input
                id="stt-model"
                type="text"
                value={model ?? ""}
                maxLength={64}
                placeholder={t("Use provider default")}
                disabled={disabled}
                aria-invalid={invalidModel}
                aria-describedby={`stt-model-help${invalidModel ? " stt-model-error" : ""}`}
                onChange={(event) => update({ model: event.target.value || null })}
              />
            ) : (
              <select
                id="stt-model"
                value={model ?? ""}
                disabled={disabled}
                onChange={(event) => update({ model: event.target.value || null })}
              >
                <option value="">{t("Use provider default")}</option>
                {hasUnlistedModel ? (
                  <option value={model!}>{t("{{model}} (current)", { model: model! })}</option>
                ) : null}
                {choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {provider === "openai"
                      ? t(choice === "gpt-transcribe" ? "{{model}} (recommended)" : "{{model}} (legacy)", { model: choice })
                      : choice}
                  </option>
                ))}
              </select>
            )}
            {provider === "custom" ? (
              <small id="stt-model-help">
                {t("Optional. Leave blank to use the provider default. Up to 64 letters, digits, ., _, /, or -; start with a letter or digit.")}
              </small>
            ) : null}
            {invalidModel ? (
              <div id="stt-model-error" className="form-message error-message" role="alert">
                {t("Enter a model of up to 64 letters, digits, ., _, /, or -, starting with a letter or digit.")}
              </div>
            ) : null}
          </div>

          <label className="stt-settings-field" htmlFor="stt-default-language">
            <span>{t("Default transcription language")}</span>
            <select
              id="stt-default-language"
              aria-label={t("Default transcription language")}
              value={defaultLanguage}
              disabled={disabled}
              onChange={(event) => update({ defaultLanguage: event.target.value })}
            >
              {hasUnlistedLanguage ? (
                <option value={defaultLanguage}>{t("{{language}} (current)", { language: defaultLanguage.toUpperCase() })}</option>
              ) : null}
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>{t(option.label)}</option>
              ))}
            </select>
            <small>
              {t("Automatic mode supports multilingual calls. A language chosen on an individual upload can override this default.")}
            </small>
          </label>

          <div className="stt-enhancement-setting">
            <div>
              <label htmlFor="stt-audio-enhancement">{t("Automatic audio enhancement")}</label>
              <small>
                {t("Applies to the custom STT service. When enabled, poor-quality audio can be enhanced automatically. When disabled, the original audio is always used.")}
              </small>
            </div>
            <label className="switch-control">
              <input
                id="stt-audio-enhancement"
                type="checkbox"
                role="switch"
                aria-label={t("Automatic audio enhancement")}
                checked={enableAudioEnhancement}
                disabled={disabled}
                onChange={(event) => update({ enableAudioEnhancement: event.target.checked })}
              />
              <span aria-hidden="true" />
              <span className="sr-only">{t(enableAudioEnhancement ? "Enabled" : "Disabled")}</span>
            </label>
          </div>

          {loading ? <p className="stt-settings-status">{t("Refreshing settings…")}</p> : null}
          {isDirty ? <p className="stt-settings-status" role="status">{t("Unsaved changes")}</p> : null}
          {errorMessage ? (
            <div className="form-message error-message" role="alert">{t(errorMessage as TranslationKey)}</div>
          ) : null}
          {successMessage && !isDirty ? (
            <div className="form-message success-message" role="status">{t(successMessage as TranslationKey)}</div>
          ) : null}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={!isDirty || disabled}
              onClick={() => setDraft(createDraft(currentValue))}
            >
              {t("Reset")}
            </button>
            <button type="submit" disabled={!isDirty || disabled || invalidModel}>
              {t(saving ? "Saving…" : "Save STT settings")}
            </button>
          </div>
          <small className="stt-settings-company-id">{t("Company {{companyId}}", { companyId })}</small>
        </form>
      )}
    </section>
  );
}
