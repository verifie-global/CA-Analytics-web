import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createWorkflowDestination,
  deleteWorkflowDestination,
  fetchWorkflowDeliveries,
  fetchWorkflowDestinations,
  testWorkflowDestination,
  updateWorkflowDestination,
} from "./api";
import type {
  AppSettings,
  WorkflowDelivery,
  WorkflowDestination,
  WorkflowDestinationInput,
  WorkflowPlatform,
  WorkflowTestResult,
} from "./types";
import { getIntlLocale, useI18n } from "./i18n";
import {
  buildWorkflowDestinationRequest,
  emptyBitrix24Lead,
  emptyJiraIssue,
  emptyWebhookOptions,
  isWebhookPlatform,
  platformLabel,
} from "./workflowDestinationModel";

type WorkflowAutomationsPageProps = {
  settings: AppSettings;
  onUnauthorized: () => void;
};

type KeyValueRow = {
  id: string;
  key: string;
  value: string;
};

type WorkflowDraft = WorkflowDestinationInput;

const platformPresets: { value: WorkflowPlatform; label: string }[] = [
  { value: "Zapier", label: "Zapier" },
  { value: "Make", label: "Make" },
  { value: "n8n", label: "n8n" },
  { value: "Pipedream", label: "Pipedream" },
  { value: "Power Automate", label: "Power Automate" },
  { value: "Custom Webhook", label: "Custom Webhook" },
  { value: "jira", label: "Jira" },
  { value: "bitrix24", label: "Bitrix24" },
];

const sentimentOptions = ["positive", "neutral", "negative"];
const urgencyOptions = ["low", "medium", "high", "critical"];

const createRowId = () =>
  `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const emptyDraft = (): WorkflowDraft => ({
  name: "",
  platform: "Custom Webhook",
  eventType: "analysis.completed",
  isEnabled: true,
  webhookUrl: "",
  headers: {},
  filters: {
    sentiments: [],
    taskUrgencies: [],
    departments: [],
    minSatisfactionScore: null,
    maxSatisfactionScore: null,
    minFriendlinessScore: null,
    maxFriendlinessScore: null,
    minQaScore: null,
    maxQaScore: null,
    qaApplicable: null,
    isInbound: null,
  },
  payloadOptions: {
    ...emptyWebhookOptions(),
    jiraIssue: emptyJiraIssue(),
    bitrix24Lead: emptyBitrix24Lead(),
  },
  metadata: {},
});

const toKeyValueRows = (record: Record<string, string>): KeyValueRow[] => {
  const rows = Object.entries(record).map(([key, value]) => ({
    id: createRowId(),
    key,
    value,
  }));

  return rows.length > 0 ? rows : [{ id: createRowId(), key: "", value: "" }];
};

const fromKeyValueRows = (rows: KeyValueRow[]) =>
  rows.reduce<Record<string, string>>((result, row) => {
    const key = row.key.trim();
    if (key) {
      result[key] = row.value;
    }
    return result;
  }, {});

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(getIntlLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const truncateUrl = (value: string) => {
  if (!value) return "-";
  return value.length > 52 ? `${value.slice(0, 30)}...${value.slice(-16)}` : value;
};

const isUnauthorizedError = (error: unknown) =>
  Boolean(
    error &&
      typeof error === "object" &&
      "status" in error &&
      (error as { status?: number }).status === 401,
  );

const parseNullableNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const numberInputValue = (value: number | null) => (value == null ? "" : String(value));

function OptionChips({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="workflow-chip-group">
      {options.map((option) => (
        <label key={option} className="workflow-chip">
          <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, option]
                  : selected.filter((item) => item !== option),
              )
            }
          />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}

function KeyValueEditor({
  rows,
  keyPlaceholder,
  valuePlaceholder,
  onChange,
}: {
  rows: KeyValueRow[];
  keyPlaceholder: string;
  valuePlaceholder: string;
  onChange: (rows: KeyValueRow[]) => void;
}) {
  return (
    <div className="workflow-kv-list">
      {rows.map((row, index) => (
        <div key={row.id} className="workflow-kv-row">
          <input
            value={row.key}
            onChange={(event) => {
              const nextRows = [...rows];
              nextRows[index] = { ...row, key: event.target.value };
              onChange(nextRows);
            }}
            placeholder={keyPlaceholder}
            aria-label="Field name"
          />
          <input
            value={row.value}
            onChange={(event) => {
              const nextRows = [...rows];
              nextRows[index] = { ...row, value: event.target.value };
              onChange(nextRows);
            }}
            placeholder={valuePlaceholder}
            aria-label="Field value"
          />
          <button
            type="button"
            className="secondary-button small-button"
            onClick={() =>
              onChange(rows.length === 1 ? [{ id: createRowId(), key: "", value: "" }] : rows.filter((item) => item.id !== row.id))
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary-button small-button workflow-add-row"
        onClick={() => onChange([...rows, { id: createRowId(), key: "", value: "" }])}
      >
        Add row
      </button>
    </div>
  );
}

export function WorkflowAutomationsPage({
  settings,
  onUnauthorized,
}: WorkflowAutomationsPageProps) {
  const { enumLabel } = useI18n();
  const [destinations, setDestinations] = useState<WorkflowDestination[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [editingDestination, setEditingDestination] = useState<WorkflowDestination | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [draft, setDraft] = useState<WorkflowDraft>(() => emptyDraft());
  const [headersRows, setHeadersRows] = useState<KeyValueRow[]>(() => toKeyValueRows({}));
  const [customFieldRows, setCustomFieldRows] = useState<KeyValueRow[]>(() =>
    toKeyValueRows({ source: "call-analytics" }),
  );
  const [integrationFieldRows, setIntegrationFieldRows] = useState<KeyValueRow[]>(() =>
    toKeyValueRows({}),
  );
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");
  const [jiraLabels, setJiraLabels] = useState("");
  const [showBitrixUrl, setShowBitrixUrl] = useState(false);
  const [departmentInput, setDepartmentInput] = useState("");
  const [testingDestination, setTestingDestination] = useState<WorkflowDestination | null>(null);
  const [testConversationId, setTestConversationId] = useState("");
  const [testResult, setTestResult] = useState<WorkflowTestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [historyDestination, setHistoryDestination] = useState<WorkflowDestination | null>(null);
  const [deliveries, setDeliveries] = useState<WorkflowDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveriesError, setDeliveriesError] = useState("");

  const requestBody = useMemo(() => {
    const jiraIssue = draft.payloadOptions.jiraIssue ?? emptyJiraIssue();
    const bitrix24Lead = draft.payloadOptions.bitrix24Lead ?? emptyBitrix24Lead();
    const payloadOptions = {
      ...draft.payloadOptions,
      customFields: fromKeyValueRows(customFieldRows),
      jiraIssue: {
        ...jiraIssue,
        labels: jiraLabels.split(",").map((item) => item.trim()).filter(Boolean),
        additionalFields:
          draft.platform === "jira"
            ? fromKeyValueRows(integrationFieldRows)
            : jiraIssue.additionalFields,
      },
      bitrix24Lead: {
        ...bitrix24Lead,
        additionalFields:
          draft.platform === "bitrix24"
            ? fromKeyValueRows(integrationFieldRows)
            : bitrix24Lead.additionalFields,
      },
    };

    return buildWorkflowDestinationRequest({
      ...draft,
      headers: fromKeyValueRows(headersRows),
      payloadOptions,
    }, { email: jiraEmail, apiToken: jiraApiToken });
  }, [customFieldRows, draft, headersRows, integrationFieldRows, jiraApiToken, jiraEmail, jiraLabels]);

  const hasConfiguredJiraAuth = Boolean(
    editingDestination &&
      Object.keys(editingDestination.headers).some((key) => key.toLowerCase() === "authorization"),
  );

  const validationError = useMemo(() => {
    if (!requestBody.name.trim()) {
      return "Name is required.";
    }

    if (requestBody.platform === "jira") {
      const jira = requestBody.payloadOptions.jiraIssue;
      const isNewAuthorization = !hasConfiguredJiraAuth;
      if (!jiraEmail.trim() && isNewAuthorization) return "Jira account email is required.";
      if (!jiraApiToken && isNewAuthorization) return "Jira API token is required.";
      if ((jiraEmail.trim() && !jiraApiToken) || (!jiraEmail.trim() && jiraApiToken)) {
        return "Enter both Jira email and API token to replace the configured credentials.";
      }
      if (!jira?.projectKey.trim()) return "Jira project key is required.";
      if (!jira?.issueType.trim()) return "Jira issue type is required.";
    }

    try {
      const url = new URL(requestBody.webhookUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return "URL must start with http:// or https://.";
      }
    } catch {
      return `Enter a valid ${requestBody.platform === "jira" ? "Jira site" : requestBody.platform === "bitrix24" ? "Bitrix24 webhook" : "webhook"} URL.`;
    }

    return "";
  }, [hasConfiguredJiraAuth, jiraApiToken, jiraEmail, requestBody]);

  const loadDestinations = async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      setDestinations(await fetchWorkflowDestinations(settings));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onUnauthorized();
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load workflow automations.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDestinations();
  }, [settings]);

  const openCreateForm = () => {
    const nextDraft = emptyDraft();
    setEditingDestination(null);
    setDraft(nextDraft);
    setHeadersRows(toKeyValueRows(nextDraft.headers));
    setCustomFieldRows(toKeyValueRows(nextDraft.payloadOptions.customFields ?? {}));
    setIntegrationFieldRows(toKeyValueRows({}));
    setJiraEmail("");
    setJiraApiToken("");
    setJiraLabels("");
    setShowBitrixUrl(false);
    setDepartmentInput("");
    setIsFormOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const openEditForm = (destination: WorkflowDestination) => {
    setEditingDestination(destination);
    setDraft({
      name: destination.name,
      platform: destination.platform,
      eventType: destination.eventType || "analysis.completed",
      isEnabled: destination.isEnabled,
      webhookUrl: destination.webhookUrl,
      headers: destination.headers,
      filters: destination.filters,
      payloadOptions: destination.payloadOptions,
      metadata: destination.metadata,
    });
    setHeadersRows(toKeyValueRows(destination.headers));
    setCustomFieldRows(toKeyValueRows(destination.payloadOptions.customFields ?? {}));
    setIntegrationFieldRows(
      toKeyValueRows(
        destination.platform === "jira"
          ? destination.payloadOptions.jiraIssue?.additionalFields ?? {}
          : destination.platform === "bitrix24"
            ? destination.payloadOptions.bitrix24Lead?.additionalFields ?? {}
            : {},
      ),
    );
    setJiraEmail("");
    setJiraApiToken("");
    setJiraLabels(destination.payloadOptions.jiraIssue?.labels.join(", ") ?? "");
    setShowBitrixUrl(false);
    setDepartmentInput(destination.filters.departments.join(", "));
    setIsFormOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (validationError) {
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const shouldPreserveJiraHeaders =
        editingDestination && requestBody.platform === "jira" && !jiraEmail.trim() && !jiraApiToken;
      const { headers: _preservedHeaders, ...requestWithoutHeaders } = requestBody;
      const saved = editingDestination
        ? await updateWorkflowDestination(
            settings,
            editingDestination.id,
            shouldPreserveJiraHeaders ? requestWithoutHeaders : requestBody,
          )
        : await createWorkflowDestination(settings, requestBody);

      setDestinations((current) => {
        if (!editingDestination) {
          return [saved, ...current];
        }

        return current.map((item) => (item.id === saved.id ? saved : item));
      });
      setSuccessMessage(
        editingDestination ? "Workflow automation updated." : "Workflow automation created.",
      );
      setIsFormOpen(false);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onUnauthorized();
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Unable to save workflow automation.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (destination: WorkflowDestination, isEnabled: boolean) => {
    setDestinations((current) =>
      current.map((item) => (item.id === destination.id ? { ...item, isEnabled } : item)),
    );
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const saved = await updateWorkflowDestination(settings, destination.id, { isEnabled });
      setDestinations((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    } catch (error) {
      setDestinations((current) =>
        current.map((item) =>
          item.id === destination.id ? { ...item, isEnabled: destination.isEnabled } : item,
        ),
      );

      if (isUnauthorizedError(error)) {
        onUnauthorized();
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Unable to update workflow status.");
    }
  };

  const handleDelete = async (destination: WorkflowDestination) => {
    const confirmed = window.confirm(`Delete "${destination.name}"? This destination will stop receiving analyses.`);
    if (!confirmed) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    try {
      await deleteWorkflowDestination(settings, destination.id);
      setDestinations((current) => current.filter((item) => item.id !== destination.id));
      setSuccessMessage("Workflow automation deleted.");
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onUnauthorized();
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Unable to delete workflow automation.");
    }
  };

  const handleSendTest = async () => {
    if (!testingDestination) {
      return;
    }

    setTestLoading(true);
    setTestResult(null);

    try {
      setTestResult(
        await testWorkflowDestination(
          settings,
          testingDestination.id,
          testConversationId.trim() || null,
        ),
      );
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onUnauthorized();
        return;
      }

      setTestResult({
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : "Unable to send test workflow.",
      });
    } finally {
      setTestLoading(false);
    }
  };

  const openDeliveries = async (destination: WorkflowDestination) => {
    setHistoryDestination(destination);
    setDeliveries([]);
    setDeliveriesError("");
    setDeliveriesLoading(true);

    try {
      setDeliveries(await fetchWorkflowDeliveries(settings, destination.id));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onUnauthorized();
        return;
      }

      setDeliveriesError(
        error instanceof Error ? error.message : "Unable to load delivery history.",
      );
    } finally {
      setDeliveriesLoading(false);
    }
  };

  const updateFilter = <Key extends keyof WorkflowDraft["filters"]>(
    key: Key,
    value: WorkflowDraft["filters"][Key],
  ) => {
    setDraft((current) => ({
      ...current,
      filters: {
        ...current.filters,
        [key]: value,
      },
    }));
  };

  const updatePayloadOption = <Key extends keyof WorkflowDraft["payloadOptions"]>(
    key: Key,
    value: WorkflowDraft["payloadOptions"][Key],
  ) => {
    setDraft((current) => ({
      ...current,
      payloadOptions: {
        ...current.payloadOptions,
        [key]: value,
      },
    }));
  };

  const updateJiraIssue = (
    patch: Partial<NonNullable<WorkflowDraft["payloadOptions"]["jiraIssue"]>>,
  ) => {
    setDraft((current) => ({
      ...current,
      payloadOptions: {
        ...current.payloadOptions,
        jiraIssue: { ...(current.payloadOptions.jiraIssue ?? emptyJiraIssue()), ...patch },
      },
    }));
  };

  const updateBitrix24Lead = (
    patch: Partial<NonNullable<WorkflowDraft["payloadOptions"]["bitrix24Lead"]>>,
  ) => {
    setDraft((current) => ({
      ...current,
      payloadOptions: {
        ...current.payloadOptions,
        bitrix24Lead: {
          ...(current.payloadOptions.bitrix24Lead ?? emptyBitrix24Lead()),
          ...patch,
        },
      },
    }));
  };

  const handlePlatformChange = (platform: WorkflowPlatform) => {
    setDraft((current) => ({ ...current, platform }));
    setIntegrationFieldRows(
      toKeyValueRows(
        platform === "jira"
          ? draft.payloadOptions.jiraIssue?.additionalFields ?? {}
          : platform === "bitrix24"
            ? draft.payloadOptions.bitrix24Lead?.additionalFields ?? {}
            : {},
      ),
    );
  };

  const updateDepartments = (value: string) => {
    setDepartmentInput(value);
    updateFilter(
      "departments",
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );
  };

  return (
    <section className="panel workflow-settings-panel">
      <div className="workflow-page-head">
        <div className="section-heading">
          <h2>Workflow Automations</h2>
          <p>Send completed call analyses to Webhook, Jira, and Bitrix24 destinations.</p>
        </div>
        <button type="button" onClick={openCreateForm}>
          Create workflow
        </button>
      </div>

      {errorMessage ? <p className="upload-error">{errorMessage}</p> : null}
      {successMessage ? <p className="qa-success-text">{successMessage}</p> : null}

      {loading ? (
        <div className="empty-state compact-empty-state">
          <h3>Loading workflows</h3>
          <p>Fetching configured workflow destinations.</p>
        </div>
      ) : destinations.length === 0 ? (
        <div className="empty-state">
          <h3>No workflow automations</h3>
          <p>Create a workflow to deliver completed analyses to a webhook, Jira project, or Bitrix24 CRM.</p>
          <button type="button" onClick={openCreateForm}>
            Create workflow
          </button>
        </div>
      ) : (
        <div className="workflow-table-wrap">
          <div className="workflow-table workflow-table-header">
            <span>Name</span>
            <span>Platform</span>
            <span>Event</span>
            <span>Status</span>
            <span>Webhook URL</span>
            <span>Updated</span>
            <span>Actions</span>
          </div>
          {destinations.map((destination) => (
            <article key={destination.id} className="workflow-table workflow-row">
              <strong>{destination.name || "Untitled workflow"}</strong>
              <span>{platformLabel(destination.platform)}</span>
              <span>{destination.eventType}</span>
              <label className="workflow-inline-toggle">
                <input
                  type="checkbox"
                  checked={destination.isEnabled}
                  onChange={(event) => void handleToggleEnabled(destination, event.target.checked)}
                />
                <span className={`tag ${destination.isEnabled ? "status-completed" : ""}`}>
                  {destination.isEnabled ? "Enabled" : "Disabled"}
                </span>
              </label>
              <span title={destination.platform === "bitrix24" ? "Credential-bearing URL hidden" : destination.webhookUrl}>
                {destination.platform === "bitrix24" ? "Configured" : truncateUrl(destination.webhookUrl)}
              </span>
              <span>
                {formatDate(destination.updatedAt ?? destination.createdAt)}
                <small>Created {formatDate(destination.createdAt)}</small>
              </span>
              <div className="workflow-actions">
                <button type="button" className="secondary-button small-button" onClick={() => openEditForm(destination)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="secondary-button small-button"
                  onClick={() => {
                    setTestingDestination(destination);
                    setTestConversationId("");
                    setTestResult(null);
                  }}
                >
                  Test Integration
                </button>
                <button type="button" className="secondary-button small-button" onClick={() => void openDeliveries(destination)}>
                  History
                </button>
                <button type="button" className="secondary-button small-button" onClick={() => void handleDelete(destination)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {isFormOpen ? (
        <div className="modal-backdrop" onClick={() => setIsFormOpen(false)}>
          <form className="modal-card workflow-modal-card" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h2>{editingDestination ? "Edit workflow" : "Create workflow"}</h2>
              <p>Choose a platform, configure its fields, and control which analyses are delivered.</p>
            </div>

            <div className="workflow-form-grid">
              <label>
                <span className="qa-field-label">Name</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Send unhappy calls to Zapier"
                />
              </label>
              <label>
                <span className="qa-field-label">Platform</span>
                <select
                  value={draft.platform}
                  onChange={(event) => handlePlatformChange(event.target.value as WorkflowPlatform)}
                >
                  {platformPresets.map((platform) => (
                    <option key={platform.value} value={platform.value}>
                      {platform.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="qa-field-label">Event type</span>
                <select value={draft.eventType} disabled>
                  <option value="analysis.completed">analysis.completed</option>
                </select>
              </label>
              <label className="qa-scoring-toggle workflow-enabled-toggle">
                <span>
                  <span className="qa-field-label">Enabled</span>
                  <small className="qa-field-helper">Disabled destinations are saved but do not deliver events.</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.isEnabled}
                  onChange={(event) => setDraft((current) => ({ ...current, isEnabled: event.target.checked }))}
                />
              </label>
              <label className="full-width">
                <span className="qa-field-label">
                  {draft.platform === "jira" ? "Jira site URL" : draft.platform === "bitrix24" ? "Incoming webhook URL" : "Webhook URL"}
                </span>
                <input
                  type={draft.platform === "bitrix24" && !showBitrixUrl ? "password" : "url"}
                  value={draft.webhookUrl}
                  onChange={(event) => setDraft((current) => ({ ...current, webhookUrl: event.target.value }))}
                  placeholder={draft.platform === "jira" ? "https://company.atlassian.net" : draft.platform === "bitrix24" ? "https://company.bitrix24.com/rest/7/secret/" : "https://example.com/hooks/call-analysis"}
                />
                {draft.platform === "bitrix24" ? (
                  <button type="button" className="workflow-inline-reveal" onClick={() => setShowBitrixUrl((value) => !value)}>
                    {showBitrixUrl ? "Hide URL" : "Reveal URL"}
                  </button>
                ) : null}
              </label>
            </div>

            {isWebhookPlatform(draft.platform) ? <div className="editor-group workflow-form-section">
              <div className="editor-group-head">
                <h3>Headers</h3>
              </div>
              <KeyValueEditor
                rows={headersRows}
                onChange={setHeadersRows}
                keyPlaceholder="X-Source"
                valuePlaceholder="call-analytics"
              />
            </div> : null}

            {draft.platform === "jira" ? (
              <div className="editor-group workflow-form-section" data-testid="jira-fields">
                <div className="editor-group-head"><h3>Jira issue</h3></div>
                <div className="workflow-form-grid">
                  <label>
                    <span className="qa-field-label">Jira account email</span>
                    <input type="email" value={jiraEmail} onChange={(event) => setJiraEmail(event.target.value)} placeholder="agent@company.com" autoComplete="off" />
                    {hasConfiguredJiraAuth ? <small className="qa-field-helper">Configured. Enter email and token only to replace credentials.</small> : null}
                  </label>
                  <label>
                    <span className="qa-field-label">Jira API token</span>
                    <input type="password" value={jiraApiToken} onChange={(event) => setJiraApiToken(event.target.value)} placeholder={hasConfiguredJiraAuth ? "Configured" : "Required"} autoComplete="new-password" />
                  </label>
                  <label>
                    <span className="qa-field-label">Project key</span>
                    <input value={draft.payloadOptions.jiraIssue?.projectKey ?? ""} onChange={(event) => updateJiraIssue({ projectKey: event.target.value })} placeholder="SUP" />
                  </label>
                  <label>
                    <span className="qa-field-label">Issue type</span>
                    <input value={draft.payloadOptions.jiraIssue?.issueType ?? "Task"} onChange={(event) => updateJiraIssue({ issueType: event.target.value })} placeholder="Task" />
                  </label>
                  <label className="full-width">
                    <span className="qa-field-label">Custom summary</span>
                    <input value={draft.payloadOptions.jiraIssue?.summary ?? ""} onChange={(event) => updateJiraIssue({ summary: event.target.value || null })} placeholder="Optional; generated from the analysis by default" />
                  </label>
                  <label>
                    <span className="qa-field-label">Priority name</span>
                    <input value={draft.payloadOptions.jiraIssue?.priorityName ?? ""} onChange={(event) => updateJiraIssue({ priorityName: event.target.value || null })} placeholder="High" />
                  </label>
                  <label>
                    <span className="qa-field-label">Assignee account ID</span>
                    <input value={draft.payloadOptions.jiraIssue?.assigneeAccountId ?? ""} onChange={(event) => updateJiraIssue({ assigneeAccountId: event.target.value || null })} placeholder="Optional account ID" />
                  </label>
                  <label className="full-width">
                    <span className="qa-field-label">Labels</span>
                    <input value={jiraLabels} onChange={(event) => setJiraLabels(event.target.value)} placeholder="call-analytics, support" />
                    <small className="qa-field-helper">Separate labels with commas.</small>
                  </label>
                </div>
                <div className="workflow-checkbox-grid">
                  <label className="selection-toggle"><input type="checkbox" checked={draft.payloadOptions.jiraIssue?.includeAnalysisSummaryInDescription ?? true} onChange={(event) => updateJiraIssue({ includeAnalysisSummaryInDescription: event.target.checked })} /><span>Include analysis summary in description</span></label>
                  <label className="selection-toggle"><input type="checkbox" checked={draft.payloadOptions.jiraIssue?.includeTranscriptInDescription ?? false} onChange={(event) => {
                    if (event.target.checked && !window.confirm("Transcripts may contain sensitive information. Include the transcript in Jira issues?")) return;
                    updateJiraIssue({ includeTranscriptInDescription: event.target.checked });
                  }} /><span>Include transcript in description</span></label>
                </div>
                <div className="editor-group-head"><h3>Advanced additional fields</h3></div>
                <KeyValueEditor rows={integrationFieldRows} onChange={setIntegrationFieldRows} keyPlaceholder="customfield_10001" valuePlaceholder="Value" />
              </div>
            ) : null}

            {draft.platform === "bitrix24" ? (
              <div className="editor-group workflow-form-section" data-testid="bitrix24-fields">
                <div className="editor-group-head"><h3>Bitrix24 lead</h3></div>
                <div className="workflow-form-grid">
                  <label className="full-width"><span className="qa-field-label">Lead title</span><input value={draft.payloadOptions.bitrix24Lead?.title ?? ""} onChange={(event) => updateBitrix24Lead({ title: event.target.value || null })} placeholder="Optional; generated from the analysis by default" /></label>
                  <label><span className="qa-field-label">Source ID</span><input value={draft.payloadOptions.bitrix24Lead?.sourceId ?? ""} onChange={(event) => updateBitrix24Lead({ sourceId: event.target.value || null })} placeholder="CALL" /></label>
                  <label><span className="qa-field-label">Status ID</span><input value={draft.payloadOptions.bitrix24Lead?.statusId ?? ""} onChange={(event) => updateBitrix24Lead({ statusId: event.target.value || null })} placeholder="Optional" /></label>
                  <label><span className="qa-field-label">Assigned user ID</span><input type="number" min="1" step="1" value={numberInputValue(draft.payloadOptions.bitrix24Lead?.assignedById ?? null)} onChange={(event) => updateBitrix24Lead({ assignedById: parseNullableNumber(event.target.value) })} /></label>
                  <label><span className="qa-field-label">Opened</span><select value={draft.payloadOptions.bitrix24Lead?.opened == null ? "default" : draft.payloadOptions.bitrix24Lead.opened ? "yes" : "no"} onChange={(event) => updateBitrix24Lead({ opened: event.target.value === "default" ? null : event.target.value === "yes" })}><option value="default">Default</option><option value="yes">Yes</option><option value="no">No</option></select></label>
                </div>
                <div className="workflow-checkbox-grid"><label className="selection-toggle"><input type="checkbox" checked={draft.payloadOptions.bitrix24Lead?.includeAnalysisSummaryInComments ?? true} onChange={(event) => updateBitrix24Lead({ includeAnalysisSummaryInComments: event.target.checked })} /><span>Include analysis summary in comments</span></label></div>
                <div className="editor-group-head"><h3>Additional lead fields</h3></div>
                <KeyValueEditor rows={integrationFieldRows} onChange={setIntegrationFieldRows} keyPlaceholder="UF_CRM_CALL_ID" valuePlaceholder="external-value" />
              </div>
            ) : null}

            <div className="editor-group workflow-form-section">
              <div className="editor-group-head">
                <h3>Filters</h3>
              </div>
              <div className="workflow-form-grid">
                <label>
                  <span className="qa-field-label">Sentiments</span>
                  <OptionChips
                    options={sentimentOptions}
                    selected={draft.filters.sentiments}
                    onChange={(values) => updateFilter("sentiments", values)}
                  />
                </label>
                <label>
                  <span className="qa-field-label">Task urgencies</span>
                  <OptionChips
                    options={urgencyOptions}
                    selected={draft.filters.taskUrgencies}
                    onChange={(values) => updateFilter("taskUrgencies", values)}
                  />
                </label>
                <label className="full-width">
                  <span className="qa-field-label">Departments</span>
                  <input
                    value={departmentInput}
                    onChange={(event) => updateDepartments(event.target.value)}
                    placeholder="Support, Billing, Sales"
                  />
                  <small className="qa-field-helper">Separate department tags with commas.</small>
                </label>
                {[
                  ["minSatisfactionScore", "Min satisfaction score"],
                  ["maxSatisfactionScore", "Max satisfaction score"],
                  ["minFriendlinessScore", "Min friendliness score"],
                  ["maxFriendlinessScore", "Max friendliness score"],
                  ["minQaScore", "Min QA score"],
                  ["maxQaScore", "Max QA score"],
                ].map(([key, label]) => (
                  <label key={key}>
                    <span className="qa-field-label">{label}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={numberInputValue(draft.filters[key as keyof WorkflowDraft["filters"]] as number | null)}
                      onChange={(event) =>
                        updateFilter(
                          key as keyof WorkflowDraft["filters"],
                          parseNullableNumber(event.target.value) as never,
                        )
                      }
                    />
                  </label>
                ))}
                <label>
                  <span className="qa-field-label">QA applicable</span>
                  <select
                    value={draft.filters.qaApplicable == null ? "any" : draft.filters.qaApplicable ? "yes" : "no"}
                    onChange={(event) =>
                      updateFilter(
                        "qaApplicable",
                        event.target.value === "any" ? null : event.target.value === "yes",
                      )
                    }
                  >
                    <option value="any">Any</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label>
                  <span className="qa-field-label">Call direction</span>
                  <select
                    value={draft.filters.isInbound == null ? "any" : draft.filters.isInbound ? "inbound" : "outbound"}
                    onChange={(event) =>
                      updateFilter(
                        "isInbound",
                        event.target.value === "any" ? null : event.target.value === "inbound",
                      )
                    }
                  >
                    <option value="any">Any</option>
                    <option value="inbound">Inbound</option>
                    <option value="outbound">Outbound</option>
                  </select>
                </label>
              </div>
            </div>

            {isWebhookPlatform(draft.platform) ? <div className="editor-group workflow-form-section">
              <div className="editor-group-head">
                <h3>Payload options</h3>
              </div>
              <div className="workflow-checkbox-grid">
                {[
                  ["includeTranscript", "Include full transcript"],
                  ["includeRedactedTranscript", "Include redacted transcript"],
                  ["includeAnalysisJson", "Include analysis fields"],
                  ["includeDiarization", "Include speaker diarization"],
                  ["includeQaEvaluationJson", "Include QA evaluation"],
                ].map(([key, label]) => (
                  <label key={key} className="selection-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.payloadOptions[key as keyof WorkflowDraft["payloadOptions"]])}
                      onChange={(event) =>
                        updatePayloadOption(
                          key as keyof WorkflowDraft["payloadOptions"],
                          event.target.checked as never,
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <KeyValueEditor
                rows={customFieldRows}
                onChange={setCustomFieldRows}
                keyPlaceholder="source"
                valuePlaceholder="call-analytics"
              />
            </div> : null}

            {validationError ? <p className="field-error">{validationError}</p> : null}

            <div className="modal-actions full-width">
              <button type="button" className="secondary-button" onClick={() => setIsFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={saving || Boolean(validationError)}>
                {saving ? "Saving..." : editingDestination ? "Save workflow" : "Create workflow"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {testingDestination ? (
        <div className="modal-backdrop" onClick={() => setTestingDestination(null)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h2>Send test</h2>
              <p>Leave conversation ID empty to use the latest completed call.</p>
            </div>
            <div className="grid-form">
              <label className="full-width">
                Conversation ID
                <input
                  value={testConversationId}
                  onChange={(event) => setTestConversationId(event.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>
            {testResult ? (
              <div className="workflow-test-result">
                <span className={`tag ${testResult.ok ? "status-completed" : "tag-warning"}`}>
                  {testResult.ok && (!testResult.deliveryStatus || testResult.deliveryStatus === "delivered") ? "Success" : "Failed"}
                </span>
                <strong>API HTTP {testResult.status || "-"}</strong>
                <strong>Integration HTTP {testResult.responseStatusCode ?? "-"}</strong>
                {testResult.error ? <p className="upload-error">{testResult.error}</p> : null}
                {testResult.responseBody ? <pre>{testResult.responseBody}</pre> : <p>No response body returned.</p>}
              </div>
            ) : null}
            <div className="modal-actions full-width">
              <button type="button" className="secondary-button" onClick={() => setTestingDestination(null)}>
                Close
              </button>
              <button type="button" onClick={() => void handleSendTest()} disabled={testLoading}>
                {testLoading ? "Sending..." : "Send test"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {historyDestination ? (
        <div className="modal-backdrop" onClick={() => setHistoryDestination(null)}>
          <section className="modal-card workflow-history-modal" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <h2>Delivery history</h2>
              <p>{historyDestination.name}</p>
            </div>
            {deliveriesLoading ? (
              <div className="empty-state compact-empty-state">
                <h3>Loading deliveries</h3>
                <p>Fetching recent delivery attempts.</p>
              </div>
            ) : deliveriesError ? (
              <p className="upload-error">{deliveriesError}</p>
            ) : deliveries.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <h3>No deliveries yet</h3>
                <p>This workflow has not recorded delivery attempts.</p>
              </div>
            ) : (
              <div className="workflow-delivery-list">
                <div className="workflow-delivery-grid workflow-delivery-header">
                  <span>Created</span>
                  <span>Delivered</span>
                  <span>Status</span>
                  <span>Attempts</span>
                  <span>HTTP</span>
                  <span>Error</span>
                  <span>Response</span>
                </div>
                {deliveries.map((delivery, index) => (
                  <article key={delivery.id || index} className="workflow-delivery-grid">
                    <span>{formatDate(delivery.createdAt)}</span>
                    <span>{formatDate(delivery.deliveredAt)}</span>
                    <span>{enumLabel("status", delivery.status)}</span>
                    <span>{delivery.attemptCount ?? "-"}</span>
                    <span>{delivery.responseStatusCode ?? "-"}</span>
                    <span>{delivery.error || "-"}</span>
                    <span title={delivery.responseBody ?? ""}>
                      {delivery.responseBody ? truncateUrl(delivery.responseBody) : "-"}
                    </span>
                  </article>
                ))}
              </div>
            )}
            <div className="modal-actions full-width">
              <button type="button" onClick={() => setHistoryDestination(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
