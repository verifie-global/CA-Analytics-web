import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchVoiceConnectorAccount,
  fetchVoiceConnectorAccounts,
  fetchVoiceConnectorAudit,
  fetchVoiceConnectorCatalog,
  testVoiceConnector,
  updateVoiceConnector,
} from "./api";
import type { RequestError } from "./api";
import type {
  AppSettings,
  VoiceConnectorAccount,
  VoiceConnectorAuditEvent,
  VoiceConnectorCatalogItem,
  VoiceConnectorFieldDefinition,
  VoiceConnectorTestResult,
  VoiceConnectorUpdate,
} from "./types";
import { getIntlLocale, useI18n } from "./i18n";

type Props = {
  settings: AppSettings;
  onUnauthorized: () => void;
};

type FieldValue = string | boolean;

type ConnectorDraft = {
  displayName: string;
  enabled: boolean;
  configuration: Record<string, FieldValue>;
  secrets: Record<string, string>;
  clearSecrets: string[];
};

const errorStatus = (error: unknown) =>
  error && typeof error === "object" && "status" in error
    ? (error as RequestError).status
    : undefined;

const fieldErrorKey = (key: string) => {
  const segments = key.replace(/\[(.*?)\]/g, ".$1").split(".");
  return segments[segments.length - 1]?.trim() || key;
};

const redactSecretValues = (message: string, values: string[]) =>
  values.reduce(
    (safeMessage, value) =>
      value.trim() ? safeMessage.split(value).join("[credential redacted]") : safeMessage,
    message,
  );

const safeErrorMessage = (error: unknown, fallback: string, secretValues: string[] = []) => {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "The request timed out. Check your connection and try again.";
  }
  if (error instanceof TypeError) {
    return "The service could not be reached. Check your connection and try again.";
  }
  return redactSecretValues(error instanceof Error && error.message ? error.message : fallback, secretValues);
};

const initialFieldValue = (
  field: VoiceConnectorFieldDefinition,
  account: VoiceConnectorAccount | null,
): FieldValue => {
  const value = account?.configuration?.[field.name] ?? field.default_value;
  if (field.type === "boolean") return typeof value === "boolean" ? value : value === "true";
  return value == null ? "" : String(value);
};

const createDraft = (
  provider: VoiceConnectorCatalogItem,
  account: VoiceConnectorAccount | null,
): ConnectorDraft => ({
  displayName: account?.display_name || provider.display_name,
  enabled: provider.runtime_activation_supported ? Boolean(account?.enabled) : false,
  configuration: provider.fields.reduce<Record<string, FieldValue>>((values, field) => {
    if (!field.secret) values[field.name] = initialFieldValue(field, account);
    return values;
  }, {}),
  secrets: {},
  clearSecrets: [],
});

const formatLabel = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(getIntlLocale(), { dateStyle: "medium", timeStyle: "short" }).format(date);
};

const getLastTest = (account?: VoiceConnectorAccount | null): VoiceConnectorTestResult | null => {
  if (!account) return null;
  if (account.last_test) return account.last_test;
  const legacy = (account as VoiceConnectorAccount & {
    last_test_result?: VoiceConnectorTestResult | string | null;
    last_test_status?: string | null;
  });
  if (typeof legacy.last_test_result === "object" && legacy.last_test_result) {
    return legacy.last_test_result;
  }
  const status =
    typeof legacy.last_test_result === "string"
      ? legacy.last_test_result
      : legacy.last_test_status;
  return status ? { status } : null;
};

const readinessClass = (readiness: string) => {
  if (readiness === "available") return "readiness-available";
  if (readiness === "experimental") return "readiness-experimental";
  return "readiness-adapter";
};

const testStatusClass = (status: string) =>
  status === "connected"
    ? "test-connected"
    : status === "testing"
      ? "test-testing"
      : status === "adapter_required"
        ? "test-adapter"
        : "test-failed";

function ProviderMark({ provider, name }: { provider: string; name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || provider.slice(0, 2).toUpperCase();
  return <span className="provider-mark" aria-hidden="true">{initials}</span>;
}

function DynamicField({
  field,
  value,
  error,
  onChange,
}: {
  field: VoiceConnectorFieldDefinition;
  value: FieldValue;
  error?: string;
  onChange: (value: FieldValue) => void;
}) {
  const id = `voice-field-${field.name}`;
  const descriptionId = field.description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  if (field.type === "boolean") {
    return (
      <div className={`voice-field voice-boolean-field ${error ? "voice-field-invalid" : ""}`}>
        <div>
          <label htmlFor={id}>{field.label}{field.required ? <span className="required-mark" aria-hidden="true"> *</span> : null}</label>
          {field.description ? <small id={descriptionId}>{field.description}</small> : null}
          {error ? <small id={errorId} className="field-error" role="alert">{error}</small> : null}
        </div>
        <span className="switch-control">
          <input
            id={id}
            type="checkbox"
            role="switch"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
            aria-describedby={describedBy}
            aria-invalid={Boolean(error)}
          />
          <span aria-hidden="true" />
          <span className="sr-only">{Boolean(value) ? "Enabled" : "Disabled"}</span>
        </span>
      </div>
    );
  }

  return (
    <div className={`voice-field ${error ? "voice-field-invalid" : ""}`}>
      <label htmlFor={id}>
        {field.label}{field.required ? <span className="required-mark" aria-hidden="true"> *</span> : null}
      </label>
      {field.type === "select" ? (
        <select
          id={id}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
        >
          <option value="">Select an option</option>
          {(field.allowed_values ?? []).map((option) => (
            <option key={String(option)} value={String(option)}>{String(option)}</option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={field.type === "number" ? "number" : field.type === "url" ? "url" : field.type === "password" ? "password" : "text"}
          value={String(value)}
          placeholder={field.placeholder ?? undefined}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
        />
      )}
      {field.description ? <small id={descriptionId}>{field.description}</small> : null}
      {error ? <small id={errorId} className="field-error" role="alert">{error}</small> : null}
    </div>
  );
}

function AuditHistory({
  events,
  loading,
  error,
}: {
  events: VoiceConnectorAuditEvent[];
  loading: boolean;
  error: string;
}) {
  const [copiedTrace, setCopiedTrace] = useState("");
  const copyTrace = async (traceId: string) => {
    await navigator.clipboard?.writeText(traceId);
    setCopiedTrace(traceId);
  };

  return (
    <section className="connector-section audit-section" aria-labelledby="audit-title">
      <div className="connector-section-heading">
        <div><h2 id="audit-title">Audit history</h2><p>The 25 most recent administrative events.</p></div>
      </div>
      {loading ? (
        <div className="audit-skeleton" aria-label="Loading audit history"><span /><span /><span /></div>
      ) : error ? (
        <div className="inline-error" role="alert">{error}</div>
      ) : events.length === 0 ? (
        <div className="connector-empty compact"><p>No audit events yet.</p></div>
      ) : (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead><tr><th>Action</th><th>Actor</th><th>Date / time</th><th>Changed fields</th><th>Trace ID</th></tr></thead>
            <tbody>{events.map((event, index) => {
              const raw = event as VoiceConnectorAuditEvent & {
                actor_name?: string; created_at?: string; timestamp?: string; fields?: string[]; traceId?: string;
              };
              const traceId = event.trace_id ?? raw.traceId ?? "";
              const changedFields = event.changed_fields ?? raw.fields ?? [];
              return (
                <tr key={String(event.id ?? `${event.occurred_at}-${index}`)}>
                  <td data-label="Action">{formatLabel(event.action)}</td>
                  <td data-label="Actor">{event.actor || raw.actor_name || "System"}</td>
                  <td data-label="Date / time">{formatDateTime(event.occurred_at || raw.created_at || raw.timestamp)}</td>
                  <td data-label="Changed fields">{changedFields.length ? changedFields.map(formatLabel).join(", ") : "—"}</td>
                  <td data-label="Trace ID">{traceId ? <div className="trace-id"><code>{traceId}</code><button type="button" className="secondary-button small-button" onClick={() => void copyTrace(traceId)} aria-label={`Copy trace ID ${traceId}`}>{copiedTrace === traceId ? "Copied" : "Copy"}</button></div> : "—"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function VoiceConnectorsPage({ settings, onUnauthorized }: Props) {
  const { enumLabel } = useI18n();
  const onUnauthorizedRef = useRef(onUnauthorized);
  const accountsRef = useRef<VoiceConnectorAccount[]>([]);
  const [catalog, setCatalog] = useState<VoiceConnectorCatalogItem[]>([]);
  const [accounts, setAccounts] = useState<VoiceConnectorAccount[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState<VoiceConnectorAccount | null>(null);
  const [draft, setDraft] = useState<ConnectorDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditEvents, setAuditEvents] = useState<VoiceConnectorAuditEvent[]>([]);
  const [auditError, setAuditError] = useState("");
  const [pageError, setPageError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [testResult, setTestResult] = useState<VoiceConnectorTestResult | null>(null);

  useEffect(() => { onUnauthorizedRef.current = onUnauthorized; }, [onUnauthorized]);
  useEffect(() => { accountsRef.current = accounts; }, [accounts]);

  const provider = useMemo(
    () => catalog.find((item) => item.provider === selectedProvider) ?? null,
    [catalog, selectedProvider],
  );

  const accountByProvider = useMemo(
    () => new Map(accounts.map((item) => [item.provider, item])),
    [accounts],
  );

  const visibleProviders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalog.filter((item) =>
      !query || `${item.display_name} ${item.provider}`.toLowerCase().includes(query));
  }, [catalog, search]);

  const handleAuthorizationError = useCallback((error: unknown) => {
    if (errorStatus(error) === 401) {
      onUnauthorizedRef.current();
      return true;
    }
    if (errorStatus(error) === 403) {
      setAccessDenied(true);
      return true;
    }
    return false;
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setPageError("");
    setAccessDenied(false);
    try {
      const [nextCatalog, nextAccounts] = await Promise.all([
        fetchVoiceConnectorCatalog(settings),
        fetchVoiceConnectorAccounts(settings),
      ]);
      setCatalog(nextCatalog);
      setAccounts(nextAccounts);
      setSelectedProvider((current) =>
        nextCatalog.some((item) => item.provider === current)
          ? current
          : nextCatalog[0]?.provider ?? "",
      );
    } catch (error) {
      if (!handleAuthorizationError(error)) {
        setPageError(safeErrorMessage(error, "Unable to load voice connectors."));
      }
    } finally {
      setLoading(false);
    }
  }, [handleAuthorizationError, settings]);

  useEffect(() => { void loadPage(); }, [loadPage]);

  const loadAudit = useCallback(async (providerName: string) => {
    setAuditLoading(true);
    setAuditError("");
    try {
      setAuditEvents(await fetchVoiceConnectorAudit(settings, providerName, 25));
    } catch (error) {
      if (!handleAuthorizationError(error)) {
        setAuditError(safeErrorMessage(error, "Unable to load audit history."));
      }
    } finally {
      setAuditLoading(false);
    }
  }, [handleAuthorizationError, settings]);

  const loadLatestConfiguration = useCallback(async (providerName: string) => {
    const definition = catalog.find((item) => item.provider === providerName);
    if (!definition) return;
    setDetailLoading(true);
    setSaveError("");
    setConflict(false);
    setFieldErrors({});
    setSuccess("");
    setTestResult(null);
    try {
      const listedAccount = accountsRef.current.find((item) => item.provider === providerName) ?? null;
      const nextAccount = listedAccount
        ? await fetchVoiceConnectorAccount(settings, providerName)
        : null;
      setAccount(nextAccount);
      setDraft(createDraft(definition, nextAccount));
      setTestResult(getLastTest(nextAccount));
    } catch (error) {
      if (!handleAuthorizationError(error)) {
        setSaveError(safeErrorMessage(error, "Unable to load the connector configuration."));
      }
    } finally {
      setDetailLoading(false);
    }
    void loadAudit(providerName);
  }, [catalog, handleAuthorizationError, loadAudit, settings]);

  useEffect(() => {
    if (!loading && selectedProvider) void loadLatestConfiguration(selectedProvider);
  }, [loading, loadLatestConfiguration, selectedProvider]);

  const changeProvider = (providerName: string) => {
    setDraft((current) => current ? { ...current, secrets: {} } : current);
    setSelectedProvider(providerName);
  };

  const validateDraft = () => {
    if (!provider || !draft) return false;
    const errors: Record<string, string> = {};
    if (!draft.displayName.trim()) errors.display_name = "Display name is required.";

    provider.fields.forEach((field) => {
      const value = field.secret ? draft.secrets[field.name] ?? "" : draft.configuration[field.name];
      const existingSecret = Boolean(account?.secret_fields?.[field.name]);
      const willClear = draft.clearSecrets.includes(field.name);
      if (draft.enabled && field.required) {
        const missingSecret = field.secret && !String(value ?? "").trim() && (!existingSecret || willClear);
        const missingValue = !field.secret && (value == null || value === "");
        if (missingSecret || missingValue) errors[field.name] = `${field.label} is required before activation.`;
      }
      if (!field.secret && field.type === "url" && String(value ?? "").trim()) {
        try { new URL(String(value)); } catch { errors[field.name] = "Enter a valid URL."; }
      }
      if (!field.secret && field.type === "number" && String(value ?? "").trim() && !Number.isFinite(Number(value))) {
        errors[field.name] = "Enter a valid number.";
      }
    });
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!provider || !draft || saving || !validateDraft()) return;
    setSaving(true);
    setSaveError("");
    setSuccess("");
    setConflict(false);
    const secretValues = Object.values(draft.secrets);
    const input: VoiceConnectorUpdate = {
      display_name: draft.displayName.trim(),
      enabled: provider.runtime_activation_supported ? draft.enabled : false,
      configuration: provider.fields.reduce<VoiceConnectorUpdate["configuration"]>((values, field) => {
        if (field.secret) return values;
        const value = draft.configuration[field.name];
        const allowedValue = field.type === "select"
          ? field.allowed_values?.find((option) => String(option) === String(value))
          : undefined;
        values[field.name] = field.type === "number" && value !== ""
          ? Number(value)
          : allowedValue ?? value;
        return values;
      }, {}),
      secrets: provider.fields.reduce<Record<string, string>>((values, field) => {
        const value = field.secret ? draft.secrets[field.name]?.trim() : "";
        if (value) values[field.name] = value;
        return values;
      }, {}),
      clear_secrets: draft.clearSecrets,
      expected_version: account?.configuration_version ?? 0,
    };

    try {
      await updateVoiceConnector(settings, provider.provider, input);
      const [nextAccount, nextAccounts] = await Promise.all([
        fetchVoiceConnectorAccount(settings, provider.provider),
        fetchVoiceConnectorAccounts(settings),
      ]);
      setAccount(nextAccount);
      setAccounts(nextAccounts);
      setDraft(createDraft(provider, nextAccount));
      setTestResult(getLastTest(nextAccount));
      setSuccess("Connector configuration saved.");
      void loadAudit(provider.provider);
    } catch (error) {
      if (handleAuthorizationError(error)) return;
      if (errorStatus(error) === 409) {
        setConflict(true);
        setSaveError("Another administrator changed this connector. Reload the latest configuration before saving again.");
      } else {
        const requestError = error as RequestError;
        if (errorStatus(error) === 400 && requestError.fieldErrors) {
          setFieldErrors(Object.entries(requestError.fieldErrors).reduce<Record<string, string>>((result, [key, message]) => {
            result[fieldErrorKey(key)] = redactSecretValues(message, secretValues);
            return result;
          }, {}));
        }
        const message = safeErrorMessage(
          error,
          "Unable to save the connector. Your non-secret changes are still here; try again.",
          secretValues,
        );
        setSaveError(errorStatus(error) === 503
          ? `Secure credential storage is unavailable. ${message}`
          : message);
      }
    } finally {
      setSaving(false);
    }
  };

  const runConnectionTest = async () => {
    if (!provider || !account || testing) return;
    setTesting(true);
    setSaveError("");
    setTestResult({ status: "testing", message: "Testing the saved connector…" });
    try {
      const result = await testVoiceConnector(settings, provider.provider);
      setTestResult(result.status === "adapter_required"
        ? { ...result, message: provider.limitation || "The production adapter must be installed before this connector can be tested." }
        : result);
      setAccounts((current) => current.map((item) =>
        item.provider === provider.provider ? { ...item, last_test: result } : item));
    } catch (error) {
      if (!handleAuthorizationError(error)) {
        setTestResult({
          status: errorStatus(error) === 503 ? "unavailable" : "timeout",
          message: safeErrorMessage(error, "The connection test could not be completed. Try again."),
        });
      }
    } finally {
      setTesting(false);
    }
  };

  if (accessDenied) {
    return (
      <section className="panel permission-denied" role="alert">
        <h1>Permission denied</h1>
        <p>Administrator access is required to manage voice connectors.</p>
      </section>
    );
  }

  return (
    <section className="panel voice-connectors-page">
      <div className="section-heading voice-connectors-heading">
        <div><h1>Voice Connectors</h1><p>Configure and monitor the voice providers available to your workspace.</p></div>
      </div>

      {pageError ? <div className="connector-page-error" role="alert"><p>{pageError}</p><button type="button" className="secondary-button" onClick={() => void loadPage()}>Retry</button></div> : null}

      {loading ? (
        <div className="voice-connectors-layout" aria-label="Loading voice connectors">
          <div className="connector-list-skeleton"><span /><span /><span /><span /></div>
          <div className="connector-detail-skeleton"><span /><span /><span /><span /><span /></div>
        </div>
      ) : catalog.length === 0 && !pageError ? (
        <div className="connector-empty"><h2>No voice providers available</h2><p>The backend catalog did not return any providers.</p></div>
      ) : catalog.length > 0 ? (
        <div className="voice-connectors-layout">
          <aside className="connector-provider-panel" aria-label="Voice providers">
            <label className="connector-search">
              <span className="sr-only">Search providers</span>
              <span className="connector-search-icon" aria-hidden="true">⌕</span>
              <input type="search" placeholder="Search providers" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <div className="connector-provider-count">{visibleProviders.length} {visibleProviders.length === 1 ? "provider" : "providers"}</div>
            <div className="connector-provider-list">
              {visibleProviders.length ? visibleProviders.map((item) => {
                const listedAccount = accountByProvider.get(item.provider);
                const lastTest = getLastTest(listedAccount);
                return (
                  <button
                    key={item.provider}
                    type="button"
                    className={`connector-provider-card ${selectedProvider === item.provider ? "is-selected" : ""}`}
                    onClick={() => changeProvider(item.provider)}
                    aria-current={selectedProvider === item.provider ? "page" : undefined}
                  >
                    <ProviderMark provider={item.provider} name={item.display_name} />
                    <span className="connector-provider-copy">
                      <strong>{item.display_name}</strong>
                      <span className="provider-card-badges">
                        <span className={`readiness-badge ${readinessClass(item.readiness)}`}>{enumLabel("status", item.readiness)}</span>
                        <span className={`configuration-badge ${listedAccount ? "is-configured" : ""}`}>{listedAccount ? "Configured" : "Not configured"}</span>
                      </span>
                      <span className="provider-card-status">
                        <span>{listedAccount?.enabled ? "Enabled" : "Disabled"}</span>
                        <span aria-hidden="true">·</span>
                        <span className={lastTest ? testStatusClass(lastTest.status) : ""}>{lastTest ? enumLabel("status", lastTest.status) : "Not tested"}</span>
                      </span>
                    </span>
                    <span className="provider-card-arrow" aria-hidden="true">›</span>
                  </button>
                );
              }) : <div className="connector-empty compact"><p>No providers match “{search}”.</p></div>}
            </div>
          </aside>

          <div className="connector-detail-panel">
            {detailLoading || !provider || !draft ? (
              <div className="connector-detail-skeleton" aria-label="Loading provider configuration"><span /><span /><span /><span /><span /></div>
            ) : (
              <>
                <header className="connector-detail-header">
                  <div className="connector-title-row"><ProviderMark provider={provider.provider} name={provider.display_name} /><div><h2>{provider.display_name}</h2><p>{provider.description || "Configure this voice provider for your workspace."}</p></div></div>
                  <span className={`readiness-badge ${readinessClass(provider.readiness)}`}>{enumLabel("status", provider.readiness)}</span>
                </header>

                {!provider.runtime_activation_supported ? (
                  <div className="connector-limitation" role="note">
                    <strong>Production adapter required</strong>
                    <p>{provider.limitation || "This provider cannot be activated in this environment."}</p>
                    <p>Save the configuration as disabled. The production adapter must be installed before activation.</p>
                  </div>
                ) : provider.limitation ? (
                  <div className="connector-limitation connector-limitation-warning" role="note"><strong>Provider limitation</strong><p>{provider.limitation}</p></div>
                ) : null}

                {saveError ? <div className="form-message error-message connector-save-error" role="alert"><span>{saveError}</span>{conflict ? <button type="button" className="secondary-button small-button" onClick={() => void loadLatestConfiguration(provider.provider)}>Reload latest configuration</button> : null}</div> : null}
                {success ? <div className="connector-toast" role="status">{success}</div> : null}

                <form className="connector-form" onSubmit={submit} noValidate>
                  <section className="connector-section" aria-labelledby="connector-settings-title">
                    <div className="connector-section-heading"><div><h2 id="connector-settings-title">Connector settings</h2><p>Name and activation state for this account.</p></div></div>
                    <div className="connector-settings-grid">
                      <div className={`voice-field ${fieldErrors.display_name ? "voice-field-invalid" : ""}`}>
                        <label htmlFor="connector-display-name">Display name <span className="required-mark" aria-hidden="true">*</span></label>
                        <input id="connector-display-name" required aria-required="true" value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} aria-invalid={Boolean(fieldErrors.display_name)} aria-describedby={fieldErrors.display_name ? "connector-display-name-error" : undefined} />
                        <small>Name shown to administrators when managing this connector.</small>
                        {fieldErrors.display_name ? <small id="connector-display-name-error" className="field-error" role="alert">{fieldErrors.display_name}</small> : null}
                      </div>
                      <div className="voice-field voice-boolean-field enabled-field">
                        <div><label htmlFor="connector-enabled">Enabled</label><small>{provider.runtime_activation_supported ? "Allow this connector to handle new calls." : "Activation is locked until the adapter is installed."}</small></div>
                        <span className="switch-control">
                          <input id="connector-enabled" type="checkbox" role="switch" checked={draft.enabled} disabled={!provider.runtime_activation_supported} onChange={(event) => {
                            if (!event.target.checked && draft.enabled && account?.enabled && !window.confirm("Disable this active connector? New calls will no longer be routed through it.")) return;
                            setDraft({ ...draft, enabled: event.target.checked });
                          }} />
                          <span aria-hidden="true" /><span className="sr-only">{draft.enabled ? "Enabled" : "Disabled"}</span>
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="connector-section" aria-labelledby="configuration-title">
                    <div className="connector-section-heading"><div><h2 id="configuration-title">Configuration</h2><p>Provider-specific behavior and endpoints.</p></div></div>
                    {provider.fields.some((field) => !field.secret) ? <div className="connector-fields-grid">
                      {provider.fields.filter((field) => !field.secret).map((field) => (
                        <DynamicField key={field.name} field={field} value={draft.configuration[field.name] ?? (field.type === "boolean" ? false : "")} error={fieldErrors[field.name]} onChange={(value) => setDraft({ ...draft, configuration: { ...draft.configuration, [field.name]: value } })} />
                      ))}
                    </div> : <div className="connector-empty compact"><p>This provider has no configuration fields.</p></div>}
                  </section>

                  {provider.fields.some((field) => field.secret) ? (
                    <section className="connector-section credentials-section" aria-labelledby="credentials-title">
                      <div className="connector-section-heading"><div><h2 id="credentials-title">Credentials</h2><p>Credentials are encrypted and write-only. Stored values are never displayed.</p></div><span className="secure-label">Write-only</span></div>
                      <div className="credential-warning" role="note">Do not rotate credentials while calls are active. Existing calls may be interrupted.</div>
                      <div className="connector-fields-grid">
                        {provider.fields.filter((field) => field.secret).map((field) => {
                          const configured = Boolean(account?.secret_fields?.[field.name]);
                          const willClear = draft.clearSecrets.includes(field.name);
                          const id = `voice-secret-${field.name}`;
                          const error = fieldErrors[field.name];
                          return (
                            <div key={field.name} className={`voice-field credential-field ${error ? "voice-field-invalid" : ""}`}>
                              <div className="credential-label-row"><label htmlFor={id}>{field.label}{field.required ? <span className="required-mark" aria-hidden="true"> *</span> : null}</label>{configured && !willClear ? <span className="configured-secret">Configured</span> : null}</div>
                              <input id={id} type="password" autoComplete="new-password" aria-required={field.required} value={draft.secrets[field.name] ?? ""} disabled={willClear} placeholder={configured ? "Configured — leave blank to keep" : field.placeholder ?? "Enter credential"} onChange={(event) => setDraft({ ...draft, secrets: { ...draft.secrets, [field.name]: event.target.value } })} aria-invalid={Boolean(error)} aria-describedby={[field.description ? `${id}-description` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined} />
                              {field.description ? <small id={`${id}-description`}>{field.description}</small> : null}
                              {configured ? <label className="clear-secret"><input type="checkbox" checked={willClear} onChange={(event) => setDraft({ ...draft, secrets: { ...draft.secrets, [field.name]: "" }, clearSecrets: event.target.checked ? [...draft.clearSecrets, field.name] : draft.clearSecrets.filter((name) => name !== field.name) })} /><span>Clear stored credential</span></label> : null}
                              {error ? <small id={`${id}-error`} className="field-error" role="alert">{error}</small> : null}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  <div className="connector-actions">
                    <span className="configuration-version">{account ? `Configuration version ${account.configuration_version}` : "Not saved yet"}</span>
                    <div><button type="button" className="secondary-button" disabled={!account || saving || testing} onClick={() => void runConnectionTest()}>{testing ? "Testing…" : "Test connection"}</button><button type="submit" disabled={saving || testing}>{saving ? "Saving…" : "Save connector"}</button></div>
                  </div>
                </form>

                {testResult ? (
                  <section className={`connection-test-result ${testStatusClass(testResult.status)}`} aria-live="polite">
                    <div><span className="test-status-dot" aria-hidden="true" /><strong>{enumLabel("status", testResult.status)}</strong>{testResult.tested_at ? <span>{formatDateTime(testResult.tested_at)}</span> : null}</div>
                    <p>{testResult.status === "adapter_required" ? provider.limitation || testResult.message : testResult.message || "The test completed."}</p>
                  </section>
                ) : null}

                <AuditHistory events={auditEvents} loading={auditLoading} error={auditError} />
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
