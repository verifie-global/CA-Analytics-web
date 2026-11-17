import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  fetchCompanyProcessingSettings,
  updateCompanyProcessingSettings,
  type RequestError,
} from "./api";
import { useI18n, type TranslationKey } from "./i18n";
import { SttSettingsPage } from "./SttSettingsPage";
import type { useCompanySttSettings } from "./useCompanySttSettings";
import type {
  AppSettings,
  CompanyProcessingSettings,
  CompanySttSettingsUpdate,
  ProcessingRedactionEngine,
  ProcessingStageName,
  ProcessingStageSettings,
  ProcessingStageSettingsUpdate,
  SttProvider,
} from "./types";
import "./ProcessingSettingsPage.css";

type Props = {
  settings: AppSettings;
  sttSettings: ReturnType<typeof useCompanySttSettings>;
  onUnauthorized?: () => void;
};

const stages = [
  { name: "stt", title: "STT endpoint" },
  { name: "diarization", title: "Speaker diarization" },
  { name: "redaction", title: "Text redaction" },
  { name: "asrCorrection", title: "ASR correction", model: true },
  { name: "qaEvaluation", title: "QA evaluation", model: true },
  { name: "analysis", title: "Satisfaction and call analysis", model: true },
] as const satisfies ReadonlyArray<{
  name: ProcessingStageName;
  title: TranslationKey;
  model?: boolean;
}>;

const providerLabels = {
  custom: "SatisfAI STT service",
  gcp: "Google Cloud",
  openai: "OpenAI",
} as const satisfies Record<SttProvider, string>;

type CredentialAction = "keep" | "replace" | "inherit" | "none";
type Draft = {
  engine: ProcessingRedactionEngine | "";
  url: string;
  model: string;
  credentialAction: CredentialAction;
  key: string;
};
type Drafts = Record<ProcessingStageName, Draft>;
type RequestScope = { settings: AppSettings; reload: number };
type LoadedState = {
  scope: RequestScope;
  value: CompanyProcessingSettings | null;
  drafts?: Drafts;
  error?: string;
  forbidden?: boolean;
};
type SaveState = {
  scope: RequestScope;
  stage: ProcessingStageName;
  pending?: boolean;
  conflict?: boolean;
  error?: string;
  success?: boolean;
};
type StageDefinition = (typeof stages)[number];

const createDraft = (value: ProcessingStageSettings): Draft => ({
  engine: value.engine ?? "",
  url: value.url ?? "",
  model: value.model ?? "",
  credentialAction: "keep",
  key: "",
});

function createDrafts(value: CompanyProcessingSettings): Drafts {
  return {
    stt: createDraft(value.stt),
    diarization: createDraft(value.diarization),
    redaction: createDraft(value.redaction),
    asrCorrection: createDraft(value.asrCorrection),
    qaEvaluation: createDraft(value.qaEvaluation),
    analysis: createDraft(value.analysis),
  };
}

const isExternalRedaction = (draft: Draft, value: ProcessingStageSettings) =>
  (draft.engine || value.defaultEngine) === "external";

function createUpdate(
  stage: StageDefinition,
  draft: Draft,
  value: ProcessingStageSettings,
): ProcessingStageSettingsUpdate {
  const update: ProcessingStageSettingsUpdate = {};
  if (stage.name === "redaction" && draft.engine !== (value.engine ?? "")) {
    update.engine = draft.engine;
  }

  if (stage.name !== "redaction" || isExternalRedaction(draft, value)) {
    if (draft.url.trim() !== (value.url ?? "")) update.url = draft.url.trim();
    if (draft.credentialAction === "replace" && draft.key.trim()) update.apiKey = draft.key.trim();
    if (draft.credentialAction === "inherit" || draft.credentialAction === "none") {
      update.apiKeyMode = draft.credentialAction;
    }
  }

  if ("model" in stage && draft.model.trim() !== (value.model ?? "")) {
    update.model = draft.model.trim();
  }

  return update;
}

const requestStatus = (error: unknown) => (error as RequestError | null)?.status;

function errorMessage(error: unknown, fallback: TranslationKey, secret?: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  return secret ? error.message.split(secret).join("[redacted]") : error.message;
}

function ProcessingStageForm({
  stage,
  value,
  provider,
  draft,
  state,
  locked,
  onChange,
  onSave,
}: {
  stage: StageDefinition;
  value: ProcessingStageSettings;
  provider: SttProvider;
  draft: Draft;
  state: SaveState | null;
  locked: boolean;
  onChange: (draft: Draft) => void;
  onSave: (update: ProcessingStageSettingsUpdate) => void;
}) {
  const { t } = useI18n();
  const id = `processing-${stage.name}`;
  const managedStt = stage.name === "stt" && provider === "gcp";
  const externalRedaction = stage.name === "redaction" && isExternalRedaction(draft, value);
  const showEndpoint = !managedStt && (stage.name !== "redaction" || externalRedaction);
  const needsKey = showEndpoint && draft.credentialAction === "replace" && !draft.key.trim();
  const missingRedactionUrl = externalRedaction && !draft.url.trim() && !value.defaultUrl;
  const hasChangedEndpoint = (draft.url.trim() || value.defaultUrl) !== (value.url || value.defaultUrl);
  const update = createUpdate(stage, draft, value);
  const modified = Object.keys(update).length > 0;
  const credentialStatus = value.apiKeyDisabled
    ? "API key disabled"
    : value.apiKeyConfigured
      ? "Company API key configured"
      : value.hasApiKey
        ? "Deployment API key in use"
        : "No API key";
  const change = (next: Partial<Draft>) => onChange({ ...draft, ...next });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!locked && !managedStt && !needsKey && !missingRedactionUrl && modified) {
      onSave(update);
    }
  };

  return (
    <form className="processing-stage" aria-labelledby={`${id}-heading`} onSubmit={submit}>
      <header className="processing-stage-heading">
        <h2 id={`${id}-heading`}>{t(stage.title)}</h2>
        {stage.name === "stt" ? (
          <span className="processing-stage-provider">{provider === "custom" ? t(providerLabels.custom) : providerLabels[provider]}</span>
        ) : null}
      </header>

      {managedStt ? (
        <p className="processing-stage-help">
          {t("Google Cloud uses its configured endpoint and service credentials.")}
        </p>
      ) : (
        <>
          <div className="stt-settings-form">
            {stage.name === "redaction" ? (
              <label className="stt-settings-field" htmlFor={`${id}-engine`}>
                {t("Redaction engine")}
                <select
                  id={`${id}-engine`}
                  value={draft.engine}
                  disabled={locked}
                  onChange={(event) => change({ engine: event.target.value as Draft["engine"] })}
                >
                  <option value="">{t("Use deployment default")}</option>
                  <option value="builtin">{t("Built-in redaction")}</option>
                  <option value="external">{t("External redaction service")}</option>
                </select>
              </label>
            ) : null}

            {showEndpoint ? (
              <>
                <label className="stt-settings-field" htmlFor={`${id}-url`}>
                  {t("Endpoint URL")}
                  <input
                    id={`${id}-url`}
                    value={draft.url}
                    type="url"
                    dir="ltr"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={value.defaultUrl ?? t("Full endpoint URL")}
                    maxLength={2048}
                    disabled={locked}
                    required={missingRedactionUrl}
                    onChange={(event) => change({ url: event.target.value })}
                  />
                </label>
                {hasChangedEndpoint && value.apiKeyConfigured && draft.credentialAction === "keep" ? (
                  <p className="processing-stage-help">
                    {t("Changing the endpoint clears the saved API key. You can supply a replacement in the same save.")}
                  </p>
                ) : null}

                {"model" in stage ? (
                  <label className="stt-settings-field" htmlFor={`${id}-model`}>
                    {t("Model ID")}
                    <input
                      id={`${id}-model`}
                      value={draft.model}
                      dir="ltr"
                      spellCheck={false}
                      autoComplete="off"
                      placeholder={value.defaultModel ?? t("Use deployment default")}
                      maxLength={200}
                      disabled={locked}
                      onChange={(event) => change({ model: event.target.value })}
                    />
                  </label>
                ) : null}

                <div className="stt-settings-field">
                  <label htmlFor={`${id}-credential`}>{t("API key")}</label>
                  <select
                    id={`${id}-credential`}
                    value={draft.credentialAction}
                    disabled={locked}
                    aria-describedby={`${id}-credential-status`}
                    onChange={(event) => change({
                      credentialAction: event.target.value as CredentialAction,
                      key: "",
                    })}
                  >
                    <option value="keep">{t("Keep current setting")}</option>
                    <option value="replace">{t("Set a new API key")}</option>
                    <option value="inherit">{t("Use deployment default")}</option>
                    <option value="none">{t("Send requests without an API key")}</option>
                  </select>
                  <small id={`${id}-credential-status`}>{t(credentialStatus)}</small>
                </div>

                {draft.credentialAction === "replace" ? (
                  <label className="stt-settings-field" htmlFor={`${id}-key`}>
                    {t("New API key")}
                    <input
                      id={`${id}-key`}
                      type="password"
                      dir="ltr"
                      value={draft.key}
                      autoComplete="new-password"
                      maxLength={4096}
                      disabled={locked}
                      required
                      onChange={(event) => change({ key: event.target.value })}
                    />
                  </label>
                ) : null}
              </>
            ) : null}
          </div>

          {state?.error && !state.conflict ? (
            <div className="form-message error-message" role="alert">{t(state.error as TranslationKey)}</div>
          ) : null}
          {state?.success ? (
            <div className="form-message success-message" role="status">{t("Settings saved.")}</div>
          ) : null}

          <div className="processing-stage-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={locked || (!modified && draft.credentialAction === "keep")}
              onClick={() => onChange(createDraft(value))}
            >
              {t("Reset")}
            </button>
            <button type="submit" disabled={locked || needsKey || missingRedactionUrl || !modified}>
              {t(state?.pending ? "Saving." : "Save settings")}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

export function ProcessingSettingsPage({ settings, sttSettings, onUnauthorized }: Props) {
  const { t } = useI18n();
  const { baseUrl, companyId, accessToken } = settings;
  const [reload, setReload] = useState(0);
  const apiSettings = useMemo<AppSettings>(
    () => ({ baseUrl, companyId, accessToken, apiToken: "" }),
    [baseUrl, companyId, accessToken],
  );
  const scope = useMemo<RequestScope>(() => ({ settings: apiSettings, reload }), [apiSettings, reload]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;
  const saveInFlight = useRef<AbortController | null>(null);
  const [data, setData] = useState<LoadedState | null>(null);
  const [saveResult, setSaveState] = useState<SaveState | null>(null);
  const saveState = saveResult?.scope === scope ? saveResult : null;
  const loaded = data?.scope === scope ? data : null;
  const { value: processingSettings, drafts } = loaded ?? {};

  useEffect(() => {
    const controller = new AbortController();
    const isCurrent = () => currentScope.current === scope && !controller.signal.aborted;

    void fetchCompanyProcessingSettings(scope.settings, undefined, controller.signal).then(
      (value) => {
        if (!isCurrent()) return;
        if (String(value.companyId) !== scope.settings.companyId) {
          setData({ scope, value: null, error: "Unable to load processing settings." });
          return;
        }
        setData((previous) => {
          const drafts = createDrafts(value);
          if (previous?.scope.settings === scope.settings && previous.value && previous.drafts) {
            // Keep edits where the saved stage still matches the draft's starting values.
            for (const { name } of stages) {
              if (name === "stt" && previous.value.sttProvider !== value.sttProvider) continue;
              const previousStage = previous.value[name];
              const stageUnchanged = (Object.keys(previousStage) as (keyof ProcessingStageSettings)[])
                .every((key) => previousStage[key] === value[name][key]);
              if (stageUnchanged) drafts[name] = previous.drafts[name];
            }
          }
          return { scope, value, drafts };
        });
      },
      (error: unknown) => {
        if (!isCurrent()) return;
        const status = requestStatus(error);
        if (status === 401) unauthorized.current?.();
        setData({
          scope,
          value: null,
          forbidden: status === 403,
          error: status === 403
            ? "Administrator access is required to manage processing settings."
            : errorMessage(error, "Unable to load processing settings."),
        });
      },
    );

    return () => {
      controller.abort();
      saveInFlight.current?.abort();
      saveInFlight.current = null;
    };
  }, [scope]);

  async function save(stage: ProcessingStageName, update: ProcessingStageSettingsUpdate) {
    if (!loaded?.value || !loaded.drafts || saveState?.conflict || saveInFlight.current || sttSettings.saving) return;
    const controller = new AbortController();
    saveInFlight.current = controller;
    const isCurrent = () => currentScope.current === scope && !controller.signal.aborted;
    setSaveState({ scope, stage, pending: true });

    try {
      const value = await updateCompanyProcessingSettings(scope.settings, {
        version: loaded.value.version,
        ...(stage === "stt" ? { sttProvider: loaded.value.sttProvider } : {}),
        [stage]: update,
      }, controller.signal);
      if (!isCurrent()) return;

      if (String(value.companyId) !== scope.settings.companyId) {
        setSaveState({ scope, stage, error: "Unable to save processing settings." });
        return;
      }
      const providerChanged = value.sttProvider !== loaded.value.sttProvider;
      setData({
        scope,
        value,
        drafts: {
          ...loaded.drafts,
          ...(providerChanged ? { stt: createDraft(value.stt) } : {}),
          [stage]: createDraft(value[stage]),
        },
      });
      setSaveState({ scope, stage, success: true });
    } catch (error) {
      if (!isCurrent()) return;
      const status = requestStatus(error);
      if (status === 401) unauthorized.current?.();
      if (status === 403) {
        setData({ scope, value: null, forbidden: true, error: "Administrator access is required to manage processing settings." });
      }
      setSaveState({
        scope,
        stage,
        conflict: status === 409,
        error: errorMessage(error, "Unable to save processing settings.", update.apiKey ?? undefined),
      });
    } finally {
      if (saveInFlight.current === controller) saveInFlight.current = null;
    }
  }

  const reloadSettings = () => {
    setSaveState(null);
    setData(null);
    setReload((previous) => previous + 1);
  };

  const saveSttSettings = async (update: CompanySttSettingsUpdate) => {
    if (saveInFlight.current) return;
    await sttSettings.save(update);
    if (currentScope.current !== scope) return;
    setSaveState(null);
    setReload((previous) => previous + 1);
  };

  return (
    <section className="panel processing-settings-page">
      <header className="section-heading">
        <h1>{t("Processing Settings")}</h1>
        <p>{t("Configure the endpoints, models, and credentials used to process calls.")}</p>
      </header>

      {!loaded ? (
        <p role="status">{t("Loading processing settings.")}</p>
      ) : null}
      {loaded?.error ? (
        <div className="form-message error-message" role="alert">{t(loaded.error as TranslationKey)}</div>
      ) : null}
      {saveState?.conflict ? (
        <div className="form-message error-message" role="alert">
          {t("Settings changed elsewhere. Reload the latest settings and reapply unsaved edits.")}
        </div>
      ) : null}
      {(loaded?.error && !loaded.forbidden) || saveState?.conflict ? (
        <button className="secondary-button" type="button" disabled={sttSettings.saving} onClick={reloadSettings}>
          {t("Reload settings")}
        </button>
      ) : null}

      {processingSettings ? (
        <p className="processing-stage-help">
          {t("Enter full endpoint URLs. Blank URL and model fields use deployment defaults.")}
        </p>
      ) : null}

      <div className="processing-settings-grid">
        <SttSettingsPage
          key={`${baseUrl}/${companyId}/${accessToken}`}
          companyId={companyId}
          isAdministrator={!sttSettings.forbidden}
          value={sttSettings.value}
          loading={sttSettings.loading}
          saving={sttSettings.saving}
          locked={Boolean(saveState?.pending)}
          errorMessage={sttSettings.errorMessage}
          successMessage={sttSettings.successMessage}
          onSave={saveSttSettings}
        />
        {processingSettings && drafts ? stages.map((stage) => (
          <ProcessingStageForm
            key={stage.name}
            stage={stage}
            value={processingSettings[stage.name]}
            provider={processingSettings.sttProvider}
            draft={drafts[stage.name]}
            state={saveState?.stage === stage.name ? saveState : null}
            locked={Boolean(sttSettings.saving || saveState?.pending || saveState?.conflict)}
            onChange={(draft) => {
              setData((previous) => previous?.scope === scope && previous.drafts ? {
                ...previous,
                drafts: { ...previous.drafts, [stage.name]: draft },
              } : previous);
              if (saveState?.stage === stage.name) setSaveState(null);
            }}
            onSave={(update) => void save(stage.name, update)}
          />
        )) : null}
      </div>
    </section>
  );
}

