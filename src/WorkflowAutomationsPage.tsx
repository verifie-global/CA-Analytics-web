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
  WorkflowTestResult,
} from "./types";

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

const platformPresets = [
  "Zapier",
  "Make",
  "n8n",
  "Pipedream",
  "Power Automate",
  "Custom Webhook",
] as const;

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
    includeTranscript: false,
    includeRedactedTranscript: true,
    includeAnalysisJson: true,
    includeDiarization: true,
    includeQaEvaluationJson: true,
    customFields: {
      source: "call-analytics",
    },
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
  return new Intl.DateTimeFormat(undefined, {
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
  const [metadataRows, setMetadataRows] = useState<KeyValueRow[]>(() => toKeyValueRows({}));
  const [departmentInput, setDepartmentInput] = useState("");
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [testingDestination, setTestingDestination] = useState<WorkflowDestination | null>(null);
  const [testConversationId, setTestConversationId] = useState("");
  const [testResult, setTestResult] = useState<WorkflowTestResult | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [historyDestination, setHistoryDestination] = useState<WorkflowDestination | null>(null);
  const [deliveries, setDeliveries] = useState<WorkflowDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveriesError, setDeliveriesError] = useState("");

  const requestBody = useMemo(
    () => ({
      ...draft,
      headers: fromKeyValueRows(headersRows),
      metadata: fromKeyValueRows(metadataRows),
      payloadOptions: {
        ...draft.payloadOptions,
        customFields: fromKeyValueRows(customFieldRows),
      },
    }),
    [customFieldRows, draft, headersRows, metadataRows],
  );

  const validationError = useMemo(() => {
    if (!requestBody.name.trim()) {
      return "Name is required.";
    }

    try {
      const url = new URL(requestBody.webhookUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return "Webhook URL must start with http:// or https://.";
      }
    } catch {
      return "Enter a valid webhook URL.";
    }

    return "";
  }, [requestBody.name, requestBody.webhookUrl]);

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
    setCustomFieldRows(toKeyValueRows(nextDraft.payloadOptions.customFields));
    setMetadataRows(toKeyValueRows(nextDraft.metadata));
    setDepartmentInput("");
    setShowJsonPreview(false);
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
    setCustomFieldRows(toKeyValueRows(destination.payloadOptions.customFields));
    setMetadataRows(toKeyValueRows(destination.metadata));
    setDepartmentInput(destination.filters.departments.join(", "));
    setShowJsonPreview(false);
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
      const saved = editingDestination
        ? await updateWorkflowDestination(settings, editingDestination.id, requestBody)
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
    const confirmed = window.confirm(`Delete "${destination.name}"? This workflow will stop sending webhooks.`);
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
          <p>Send completed call analyses to no-code tools and webhook receivers.</p>
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
          <p>Create a workflow to send completed call analyses to Zapier, Make, n8n, Pipedream, Power Automate, or a custom webhook.</p>
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
              <span>{destination.platform}</span>
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
              <span title={destination.webhookUrl}>{truncateUrl(destination.webhookUrl)}</span>
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
                  Test
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
              <p>Choose a destination, add any filtering rules, and control what analysis data is sent.</p>
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
                  onChange={(event) => setDraft((current) => ({ ...current, platform: event.target.value }))}
                >
                  {platformPresets.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="qa-field-label">Event type</span>
                <select
                  value={draft.eventType}
                  onChange={(event) => setDraft((current) => ({ ...current, eventType: event.target.value }))}
                >
                  <option value="analysis.completed">analysis.completed</option>
                </select>
              </label>
              <label className="qa-scoring-toggle workflow-enabled-toggle">
                <span>
                  <span className="qa-field-label">Enabled</span>
                  <small className="qa-field-helper">Disabled workflows are saved but do not send webhooks.</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.isEnabled}
                  onChange={(event) => setDraft((current) => ({ ...current, isEnabled: event.target.checked }))}
                />
              </label>
              <label className="full-width">
                <span className="qa-field-label">Webhook URL</span>
                <input
                  value={draft.webhookUrl}
                  onChange={(event) => setDraft((current) => ({ ...current, webhookUrl: event.target.value }))}
                  placeholder="https://hooks.zapier.com/hooks/catch/xxx/yyy"
                />
              </label>
            </div>

            <div className="editor-group workflow-form-section">
              <div className="editor-group-head">
                <h3>Headers</h3>
              </div>
              <KeyValueEditor
                rows={headersRows}
                onChange={setHeadersRows}
                keyPlaceholder="X-Source"
                valuePlaceholder="call-analytics"
              />
            </div>

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

            <div className="editor-group workflow-form-section">
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
            </div>

            <div className="editor-group workflow-form-section">
              <div className="editor-group-head">
                <h3>Metadata</h3>
              </div>
              <KeyValueEditor
                rows={metadataRows}
                onChange={setMetadataRows}
                keyPlaceholder="description"
                valuePlaceholder="Escalate negative urgent calls"
              />
            </div>

            <details className="workflow-json-preview" open={showJsonPreview} onToggle={(event) => setShowJsonPreview(event.currentTarget.open)}>
              <summary>Advanced JSON preview</summary>
              <pre>{JSON.stringify(requestBody, null, 2)}</pre>
            </details>

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
                  {testResult.ok ? "Success" : "Failed"}
                </span>
                <strong>API HTTP {testResult.status || "-"}</strong>
                <strong>Webhook HTTP {testResult.responseStatusCode ?? "-"}</strong>
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
                    <span>{delivery.status}</span>
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
