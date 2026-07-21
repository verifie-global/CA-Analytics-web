import type {
  Bitrix24LeadOptions,
  JiraIssueOptions,
  WebhookPayloadOptions,
  WorkflowDestinationInput,
  WorkflowDestinationPayloadOptions,
  WorkflowPlatform,
} from "./types";

export type JiraCredentials = {
  email: string;
  apiToken: string;
};

export const emptyWebhookOptions = (): WebhookPayloadOptions => ({
  includeTranscript: false,
  includeRedactedTranscript: true,
  includeAnalysisJson: true,
  includeDiarization: true,
  includeQaEvaluationJson: true,
  customFields: { source: "call-analytics" },
});

export const emptyJiraIssue = (): JiraIssueOptions => ({
  projectKey: "",
  issueType: "Task",
  summary: null,
  priorityName: null,
  assigneeAccountId: null,
  labels: [],
  includeAnalysisSummaryInDescription: true,
  includeTranscriptInDescription: false,
  additionalFields: {},
});

export const emptyBitrix24Lead = (): Bitrix24LeadOptions => ({
  title: null,
  sourceId: null,
  statusId: null,
  assignedById: null,
  opened: null,
  includeAnalysisSummaryInComments: true,
  additionalFields: {},
});

export const platformLabel = (platform: WorkflowPlatform) =>
  platform === "jira" ? "Jira" : platform === "bitrix24" ? "Bitrix24" : platform;

export const isWebhookPlatform = (platform: WorkflowPlatform) =>
  platform !== "jira" && platform !== "bitrix24";

const base64Utf8 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

export const createJiraAuthorization = ({ email, apiToken }: JiraCredentials) =>
  `Basic ${base64Utf8(`${email.trim()}:${apiToken}`)}`;

export const payloadForPlatform = (
  platform: WorkflowPlatform,
  payloadOptions: WorkflowDestinationPayloadOptions,
): WorkflowDestinationPayloadOptions => {
  if (platform === "jira") {
    return { jiraIssue: payloadOptions.jiraIssue ?? emptyJiraIssue() };
  }
  if (platform === "bitrix24") {
    return { bitrix24Lead: payloadOptions.bitrix24Lead ?? emptyBitrix24Lead() };
  }
  const defaults = emptyWebhookOptions();
  return {
    includeTranscript: payloadOptions.includeTranscript ?? defaults.includeTranscript,
    includeRedactedTranscript:
      payloadOptions.includeRedactedTranscript ?? defaults.includeRedactedTranscript,
    includeAnalysisJson: payloadOptions.includeAnalysisJson ?? defaults.includeAnalysisJson,
    includeDiarization: payloadOptions.includeDiarization ?? defaults.includeDiarization,
    includeQaEvaluationJson:
      payloadOptions.includeQaEvaluationJson ?? defaults.includeQaEvaluationJson,
    customFields: payloadOptions.customFields ?? defaults.customFields,
  };
};

export const buildWorkflowDestinationRequest = (
  draft: WorkflowDestinationInput,
  jiraCredentials: JiraCredentials,
): WorkflowDestinationInput => {
  const headers = { ...draft.headers };
  if (draft.platform === "jira" && jiraCredentials.email.trim() && jiraCredentials.apiToken) {
    headers.Authorization = createJiraAuthorization(jiraCredentials);
  }

  return {
    ...draft,
    name: draft.name.trim(),
    webhookUrl: draft.webhookUrl.trim(),
    headers: draft.platform === "bitrix24" ? {} : headers,
    payloadOptions: payloadForPlatform(draft.platform, draft.payloadOptions),
  };
};

export const sanitizeWorkflowRequest = (request: WorkflowDestinationInput) => ({
  ...request,
  webhookUrl: request.platform === "bitrix24" ? "Configured webhook URL" : request.webhookUrl,
  headers: Object.fromEntries(
    Object.entries(request.headers).map(([key, value]) => [
      key,
      key.toLowerCase() === "authorization" ? "Configured" : value,
    ]),
  ),
});
