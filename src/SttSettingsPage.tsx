import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CompanySttSettings, CompanySttSettingsUpdate } from "./types";

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
  const [defaultLanguage, setDefaultLanguage] = useState("auto");
  const [enableAudioEnhancement, setEnableAudioEnhancement] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setDefaultLanguage(value?.defaultLanguage?.trim() || "auto");
    setEnableAudioEnhancement(value?.enableAudioEnhancement ?? true);
    setIsDirty(false);
  }, [value]);

  const hasUnlistedLanguage = useMemo(
    () =>
      Boolean(
        defaultLanguage &&
          !languageOptions.some((option) => option.value === defaultLanguage),
      ),
    [defaultLanguage],
  );

  if (!isAdministrator) {
    return (
      <section className="panel permission-denied" role="alert">
        <h1>Permission denied</h1>
        <p>Administrator access is required to view or edit speech-to-text settings.</p>
      </section>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!defaultLanguage.trim() || saving) return;

    try {
      await onSave({
        defaultLanguage: defaultLanguage.trim(),
        enableAudioEnhancement,
      });
      setIsDirty(false);
    } catch {
      // The parent exposes the safe API error in the form state.
    }
  };

  const reset = () => {
    setDefaultLanguage(value?.defaultLanguage?.trim() || "auto");
    setEnableAudioEnhancement(value?.enableAudioEnhancement ?? true);
    setIsDirty(false);
  };

  return (
    <section className="panel stt-settings-page">
      <div className="section-heading">
        <h1>STT Settings</h1>
        <p>Choose how new audio is transcribed and prepared for analysis.</p>
      </div>

      {loading && !value ? (
        <div className="empty-state" aria-live="polite">
          <h3>Loading STT settings</h3>
          <p>Fetching your company transcription defaults.</p>
        </div>
      ) : (
        <form className="stt-settings-form" onSubmit={submit} noValidate>
          <label className="stt-settings-field" htmlFor="stt-default-language">
            <span>Default transcription language</span>
            <select
              id="stt-default-language"
              aria-label="Default transcription language"
              value={defaultLanguage}
              disabled={loading || saving}
              onChange={(event) => {
                setDefaultLanguage(event.target.value);
                setIsDirty(true);
              }}
            >
              {hasUnlistedLanguage ? (
                <option value={defaultLanguage}>{defaultLanguage.toUpperCase()} (current)</option>
              ) : null}
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <small>
              Automatic mode supports multilingual calls. A language chosen on an individual upload
              can override this default.
            </small>
          </label>

          <div className="stt-enhancement-setting">
            <div>
              <label htmlFor="stt-audio-enhancement">Automatic audio enhancement</label>
              <small>
                When enabled, poor-quality audio can be enhanced automatically. When disabled, the
                original audio is always used.
              </small>
            </div>
            <label className="switch-control">
              <input
                id="stt-audio-enhancement"
                type="checkbox"
                role="switch"
                aria-label="Automatic audio enhancement"
                checked={enableAudioEnhancement}
                disabled={loading || saving}
                onChange={(event) => {
                  setEnableAudioEnhancement(event.target.checked);
                  setIsDirty(true);
                }}
              />
              <span aria-hidden="true" />
              <span className="sr-only">
                {enableAudioEnhancement ? "Enabled" : "Disabled"}
              </span>
            </label>
          </div>

          {loading ? <p className="stt-settings-status">Refreshing settings…</p> : null}
          {errorMessage ? (
            <div className="form-message error-message" role="alert">{errorMessage}</div>
          ) : null}
          {successMessage ? (
            <div className="form-message success-message" role="status">{successMessage}</div>
          ) : null}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={!isDirty || saving}
              onClick={reset}
            >
              Reset
            </button>
            <button type="submit" disabled={!isDirty || loading || saving}>
              {saving ? "Saving…" : "Save STT settings"}
            </button>
          </div>
          <small className="stt-settings-company-id">Company {companyId}</small>
        </form>
      )}
    </section>
  );
}
