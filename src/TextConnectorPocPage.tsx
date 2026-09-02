import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTextConnectorAccount,
  fetchTextConnectorAccounts,
  fetchTextConnectorPocCatalog,
  rotateTextConnectorWebhookKey,
  updateTextConnectorAccount,
} from "./api";
import type { RequestError } from "./api";
import type {
  AppSettings,
  CreateTextConnectorAccountInput,
  TextConnectorAccount,
  TextConnectorPocCatalogItem,
  TextConnectorWebhookSetup,
  UpdateTextConnectorAccountInput,
} from "./types";
import { getIntlLocale } from "./i18n";

type Props = {
  settings: AppSettings;
  onUnauthorized: () => void;
};

type AccountDraft = {
  provider: string;
  displayName: string;
  idleTimeoutMinutes: string;
  enabled: boolean;
};

const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;

const errorStatus = (error: unknown) =>
  error && typeof error === "object" && "status" in error
    ? (error as RequestError).status
    : undefined;

const safeErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof TypeError) {
    return "The service could not be reached. Check your connection and try again.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

const newDraft = (provider = ""): AccountDraft => ({
  provider,
  displayName: "",
  idleTimeoutMinutes: String(DEFAULT_IDLE_TIMEOUT_MINUTES),
  enabled: false,
});

const editDraft = (account: TextConnectorAccount): AccountDraft => ({
  provider: account.provider,
  displayName: account.displayName,
  idleTimeoutMinutes: String(account.idleTimeoutMinutes),
  enabled: account.enabled,
});

const formatDateTime = (value?: string | null) => {
  if (!value) return "No webhook activity yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(getIntlLocale(), {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
};

const providerInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

const normalizedFieldErrors = (error: unknown) => {
  const requestError = error as RequestError;
  return Object.entries(requestError.fieldErrors ?? {}).reduce<Record<string, string>>(
    (result, [key, message]) => {
      const field = key.split(".").pop()?.replace(/\[(.*?)\]/g, "$1") ?? key;
      result[field.charAt(0).toLowerCase() + field.slice(1)] = message;
      return result;
    },
    {},
  );
};

function AccountForm({
  draft,
  editing,
  providers,
  saving,
  error,
  fieldErrors,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: AccountDraft;
  editing: boolean;
  providers: TextConnectorPocCatalogItem[];
  saving: boolean;
  error: string;
  fieldErrors: Record<string, string>;
  onChange: (draft: AccountDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <section className="text-account-form-card" aria-labelledby="text-account-form-title">
      <div className="connector-section-heading">
        <div>
          <h2 id="text-account-form-title">{editing ? "Edit text connector" : "Create text connector"}</h2>
          <p>Configure webhook collection. New accounts start disabled unless enabled here.</p>
        </div>
      </div>

      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      <form className="connector-form" onSubmit={onSubmit}>
        <div className="connector-section text-account-form-grid">
          <div className={`voice-field ${fieldErrors.provider ? "voice-field-invalid" : ""}`}>
            <label htmlFor="text-account-provider">Provider <span className="required-mark">*</span></label>
            <select id="text-account-provider" value={draft.provider} onChange={(event) => onChange({ ...draft, provider: event.target.value })} disabled={editing} required aria-invalid={Boolean(fieldErrors.provider)}>
              <option value="">Select a provider</option>
              {providers.map((provider) => <option key={provider.provider} value={provider.provider}>{provider.displayName}</option>)}
            </select>
            {fieldErrors.provider ? <small className="field-error" role="alert">{fieldErrors.provider}</small> : null}
          </div>

          <div className={`voice-field ${fieldErrors.displayName ? "voice-field-invalid" : ""}`}>
            <label htmlFor="text-account-display-name">Display name <span className="required-mark">*</span></label>
            <input id="text-account-display-name" value={draft.displayName} onChange={(event) => onChange({ ...draft, displayName: event.target.value })} maxLength={120} required aria-invalid={Boolean(fieldErrors.displayName)} />
            {fieldErrors.displayName ? <small className="field-error" role="alert">{fieldErrors.displayName}</small> : null}
          </div>

          <div className={`voice-field ${fieldErrors.idleTimeoutMinutes ? "voice-field-invalid" : ""}`}>
            <label htmlFor="text-account-idle-timeout">Idle timeout (minutes) <span className="required-mark">*</span></label>
            <input id="text-account-idle-timeout" type="number" min="1" max="10080" value={draft.idleTimeoutMinutes} onChange={(event) => onChange({ ...draft, idleTimeoutMinutes: event.target.value })} required aria-invalid={Boolean(fieldErrors.idleTimeoutMinutes)} />
            <small>Inactive conversations are finalized automatically after this interval.</small>
            {fieldErrors.idleTimeoutMinutes ? <small className="field-error" role="alert">{fieldErrors.idleTimeoutMinutes}</small> : null}
          </div>

          <div className="voice-field voice-boolean-field">
            <div>
              <label htmlFor="text-account-enabled">Enabled</label>
              <small>{draft.enabled ? "Webhook ingestion is enabled." : "Webhook ingestion remains off."}</small>
            </div>
            <span className="switch-control">
              <input id="text-account-enabled" type="checkbox" role="switch" checked={draft.enabled} onChange={(event) => onChange({ ...draft, enabled: event.target.checked })} />
              <span aria-hidden="true" />
              <span className="sr-only">{draft.enabled ? "Enabled" : "Disabled"}</span>
            </span>
          </div>
        </div>

        <div className="connector-actions text-account-form-actions">
          <span>{editing ? "Saving uses the latest account version." : "The webhook key is shown once after creation."}</span>
          <div>
            <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create account"}</button>
          </div>
        </div>
      </form>
    </section>
  );
}

function WebhookSetupDialog({
  setup,
  copied,
  onCopy,
  onClose,
}: {
  setup: TextConnectorWebhookSetup;
  copied: "url" | "key" | "";
  onCopy: (kind: "url" | "key", value: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-card text-webhook-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="webhook-setup-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="text-kicker">One-time setup</span>
            <h2 id="webhook-setup-title">Save the webhook key now</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close webhook setup">×</button>
        </div>
        <div className="text-key-warning" role="note">This key will not be shown again. Copy it before closing this dialog.</div>
        <dl className="text-webhook-values">
          <div><dt>Account</dt><dd>{setup.account.displayName}</dd></div>
          <div>
            <dt>Webhook URL</dt>
            <dd><code data-i18n-skip>{setup.webhookUrl || "Not returned by the API"}</code></dd>
            <button type="button" className="secondary-button small-button" onClick={() => onCopy("url", setup.webhookUrl)} disabled={!setup.webhookUrl}>{copied === "url" ? "Copied" : "Copy URL"}</button>
          </div>
          <div>
            <dt>Webhook key</dt>
            <dd><code data-i18n-skip>{setup.webhookKey || "Not returned by the API"}</code></dd>
            <button type="button" className="secondary-button small-button" onClick={() => onCopy("key", setup.webhookKey)} disabled={!setup.webhookKey}>{copied === "key" ? "Copied" : "Copy key"}</button>
          </div>
        </dl>
        <div className="text-webhook-dialog-actions"><button type="button" onClick={onClose}>I saved the key</button></div>
      </section>
    </div>
  );
}

export function TextConnectorPocPage({ settings, onUnauthorized }: Props) {
  const onUnauthorizedRef = useRef(onUnauthorized);
  const [catalog, setCatalog] = useState<TextConnectorPocCatalogItem[]>([]);
  const [accounts, setAccounts] = useState<TextConnectorAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [notification, setNotification] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState("");
  const [draft, setDraft] = useState<AccountDraft>(newDraft());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [actionAccountId, setActionAccountId] = useState("");
  const [webhookSetup, setWebhookSetup] = useState<TextConnectorWebhookSetup | null>(null);
  const [copiedSetupValue, setCopiedSetupValue] = useState<"url" | "key" | "">("");

  useEffect(() => { onUnauthorizedRef.current = onUnauthorized; }, [onUnauthorized]);

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

  const reloadAccounts = useCallback(async () => {
    const nextAccounts = await fetchTextConnectorAccounts(settings);
    setAccounts(nextAccounts);
    return nextAccounts;
  }, [settings]);

  const reloadAfterMutation = async (completedAction: string) => {
    try {
      await reloadAccounts();
    } catch (error) {
      if (!handleAuthorizationError(error)) {
        setPageError(`${completedAction}, but the account list could not be refreshed. Reload the page to see the latest settings.`);
      }
    }
  };

  const loadPage = useCallback(async () => {
    setLoading(true);
    setPageError("");
    setAccessDenied(false);
    try {
      const [nextCatalog, nextAccounts] = await Promise.all([
        fetchTextConnectorPocCatalog(settings),
        fetchTextConnectorAccounts(settings),
      ]);
      setCatalog(nextCatalog);
      setAccounts(nextAccounts);
      setDraft((current) => current.provider ? current : newDraft(nextCatalog[0]?.provider ?? ""));
    } catch (error) {
      if (!handleAuthorizationError(error)) setPageError(safeErrorMessage(error, "Unable to load text connector accounts."));
    } finally {
      setLoading(false);
    }
  }, [handleAuthorizationError, settings]);

  useEffect(() => { void loadPage(); }, [loadPage]);

  const providerNames = useMemo(() => new Map(catalog.map((provider) => [provider.provider, provider.displayName])), [catalog]);

  const openCreate = () => {
    setEditingAccountId("");
    setDraft(newDraft(catalog[0]?.provider ?? ""));
    setFieldErrors({});
    setFormError("");
    setNotification("");
    setFormOpen(true);
  };

  const openEdit = (account: TextConnectorAccount) => {
    setEditingAccountId(account.accountId);
    setDraft(editDraft(account));
    setFieldErrors({});
    setFormError("");
    setNotification("");
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingAccountId("");
    setFormError("");
    setFieldErrors({});
  };

  const validateDraft = () => {
    const errors: Record<string, string> = {};
    const timeout = Number(draft.idleTimeoutMinutes);
    if (!draft.provider) errors.provider = "Provider is required.";
    if (!draft.displayName.trim()) errors.displayName = "Display name is required.";
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 10080) errors.idleTimeoutMinutes = "Idle timeout must be a whole number from 1 to 10,080 minutes.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleConflict = async (accountId: string) => {
    try {
      const latestAccounts = await reloadAccounts();
      const latest = latestAccounts.find((account) => account.accountId === accountId);
      if (latest && editingAccountId === accountId) setDraft(editDraft(latest));
      setFormError("This account was modified elsewhere. The latest settings were reloaded; review them before saving again.");
      setNotification("Account changed elsewhere. Latest settings reloaded.");
    } catch (reloadError) {
      if (!handleAuthorizationError(reloadError)) setFormError("This account was modified elsewhere, but the latest settings could not be reloaded.");
    }
  };

  const submitAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !validateDraft()) return;
    setSaving(true);
    setFormError("");
    setNotification("");
    const timeout = Number(draft.idleTimeoutMinutes);
    const editingAccount = accounts.find((account) => account.accountId === editingAccountId);

    try {
      if (editingAccount) {
        const input: UpdateTextConnectorAccountInput = { displayName: draft.displayName.trim(), idleTimeoutMinutes: timeout, enabled: draft.enabled, expectedVersion: editingAccount.version };
        await updateTextConnectorAccount(settings, editingAccount.accountId, input);
        await reloadAfterMutation("The account was updated");
        setNotification("Text connector account updated.");
      } else {
        const input: CreateTextConnectorAccountInput = { provider: draft.provider, displayName: draft.displayName.trim(), idleTimeoutMinutes: timeout, enabled: draft.enabled };
        const setup = await createTextConnectorAccount(settings, input);
        setWebhookSetup(setup);
        setCopiedSetupValue("");
        setNotification("Text connector account created.");
        await reloadAfterMutation("The account was created");
      }
      closeForm();
    } catch (error) {
      if (handleAuthorizationError(error)) return;
      if (errorStatus(error) === 409 && editingAccount) {
        await handleConflict(editingAccount.accountId);
      } else {
        if (errorStatus(error) === 400) setFieldErrors(normalizedFieldErrors(error));
        setFormError(safeErrorMessage(error, "Unable to save the text connector account."));
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleAccount = async (account: TextConnectorAccount) => {
    if (actionAccountId) return;
    setActionAccountId(account.accountId);
    setNotification("");
    setPageError("");
    try {
      await updateTextConnectorAccount(settings, account.accountId, { displayName: account.displayName, idleTimeoutMinutes: account.idleTimeoutMinutes, enabled: !account.enabled, expectedVersion: account.version });
      await reloadAfterMutation(`The account was ${account.enabled ? "disabled" : "enabled"}`);
      setNotification(`Account ${account.enabled ? "disabled" : "enabled"}.`);
    } catch (error) {
      if (handleAuthorizationError(error)) return;
      if (errorStatus(error) === 409) await handleConflict(account.accountId);
      else setPageError(safeErrorMessage(error, "Unable to change the account status."));
    } finally {
      setActionAccountId("");
    }
  };

  const rotateKey = async (account: TextConnectorAccount) => {
    if (actionAccountId || !window.confirm("Rotate this webhook key? The previous key will stop working.")) return;
    setActionAccountId(account.accountId);
    setNotification("");
    setPageError("");
    try {
      const setup = await rotateTextConnectorWebhookKey(settings, account.accountId);
      setWebhookSetup(setup);
      setCopiedSetupValue("");
      setNotification("Webhook key rotated.");
      await reloadAfterMutation("The webhook key was rotated");
    } catch (error) {
      if (!handleAuthorizationError(error)) setPageError(safeErrorMessage(error, "Unable to rotate the webhook key."));
    } finally {
      setActionAccountId("");
    }
  };

  const closeWebhookSetup = () => {
    setWebhookSetup(null);
    setCopiedSetupValue("");
  };

  const copySetupValue = async (kind: "url" | "key", value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedSetupValue(kind);
    } catch {
      setPageError("Clipboard access is unavailable. Select and copy the value manually.");
    }
  };

  if (accessDenied) return <section className="panel permission-denied" role="alert"><h1>Permission denied</h1><p>Administrator access is required to manage text connectors.</p></section>;

  return (
    <section className="panel text-connector-page text-accounts-page">
      <header className="text-connector-heading">
        <div><span className="text-kicker">Admin · Connector settings</span><h1>Text Connectors</h1><p>Manage Chat2Desk, Trengo, and Chatwoot webhook accounts for this company.</p></div>
        <button type="button" onClick={openCreate} disabled={loading || catalog.length === 0}>Create account</button>
      </header>

      {notification ? <div className="connector-toast text-connector-toast" role="status">{notification}</div> : null}
      {pageError ? <div className="connector-page-error" role="alert"><p>{pageError}</p><button type="button" className="secondary-button" onClick={() => void loadPage()}>Reload</button></div> : null}

      {formOpen ? <AccountForm draft={draft} editing={Boolean(editingAccountId)} providers={catalog} saving={saving} error={formError} fieldErrors={fieldErrors} onChange={(nextDraft) => { setDraft(nextDraft); setFieldErrors({}); setFormError(""); }} onCancel={closeForm} onSubmit={submitAccount} /> : null}

      <section className="text-account-list-section" aria-labelledby="text-account-list-title">
        <div className="text-section-heading"><div><span className="text-kicker">{accounts.length} configured</span><h2 id="text-account-list-title">Connector accounts</h2></div></div>
        {loading ? (
          <div className="text-catalog-skeleton" aria-label="Loading text connector accounts"><span /><span /><span /></div>
        ) : accounts.length === 0 ? (
          <div className="connector-empty"><h2>No text connector accounts</h2><p>Create an account to receive provider webhooks.</p><button type="button" onClick={openCreate} disabled={catalog.length === 0}>Create account</button></div>
        ) : (
          <div className="text-account-grid">
            {accounts.map((account) => {
              const providerName = providerNames.get(account.provider) ?? account.provider;
              const busy = actionAccountId === account.accountId;
              return (
                <article key={account.accountId} className="text-account-card">
                  <header><span className="provider-mark" aria-hidden="true">{providerInitials(providerName)}</span><div><h3>{account.displayName}</h3><p>{providerName}</p></div><span className={`status-badge ${account.enabled ? "status-active" : "status-inactive"}`}>{account.enabled ? "Enabled" : "Disabled"}</span></header>
                  <dl>
                    <div><dt>Idle timeout</dt><dd>{account.idleTimeoutMinutes} min</dd></div>
                    <div><dt>Version</dt><dd>{account.version}</dd></div>
                    <div className="text-account-health"><dt>Last webhook activity</dt><dd><span className={account.lastReceivedAt ? "health-dot is-active" : "health-dot"} aria-hidden="true" />{formatDateTime(account.lastReceivedAt)}</dd></div>
                  </dl>
                  <div className="text-account-actions"><button type="button" className="secondary-button small-button" onClick={() => openEdit(account)} disabled={busy}>Edit</button><button type="button" className="secondary-button small-button" onClick={() => void toggleAccount(account)} disabled={busy}>{busy ? "Saving…" : account.enabled ? "Disable" : "Enable"}</button><button type="button" className="secondary-button small-button" onClick={() => void rotateKey(account)} disabled={busy}>Rotate webhook key</button></div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {webhookSetup ? <WebhookSetupDialog setup={webhookSetup} copied={copiedSetupValue} onCopy={(kind, value) => void copySetupValue(kind, value)} onClose={closeWebhookSetup} /> : null}
    </section>
  );
}
