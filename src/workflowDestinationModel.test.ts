import { describe, expect, it } from "vitest";
import type { WorkflowDestinationInput } from "./types";
import {
  buildWorkflowDestinationRequest,
  emptyBitrix24Lead,
  emptyJiraIssue,
  sanitizeWorkflowRequest,
} from "./workflowDestinationModel";

const baseDraft = (platform: WorkflowDestinationInput["platform"]): WorkflowDestinationInput => ({
  name: " Destination ",
  platform,
  eventType: "analysis.completed",
  isEnabled: true,
  webhookUrl: " https://example.test/ ",
  headers: {},
  filters: {
    sentiments: ["negative"],
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
  payloadOptions: {},
  metadata: {},
});

describe("workflow destination request mapping", () => {
  it("maps Jira options and generates Basic authorization without exposing it in previews", () => {
    const draft = baseDraft("jira");
    draft.payloadOptions.jiraIssue = {
      ...emptyJiraIssue(),
      projectKey: "SUP",
      priorityName: "High",
      labels: ["call-analytics"],
      additionalFields: { customfield_10001: "example" },
    };

    const request = buildWorkflowDestinationRequest(draft, {
      email: "agent@example.com",
      apiToken: "secret-token",
    });

    expect(request.name).toBe("Destination");
    expect(request.headers.Authorization).toMatch(/^Basic /);
    expect(request.payloadOptions).toEqual({ jiraIssue: draft.payloadOptions.jiraIssue });
    expect(sanitizeWorkflowRequest(request).headers.Authorization).toBe("Configured");
  });

  it("preserves configured Jira authorization when credentials are left blank", () => {
    const draft = baseDraft("jira");
    draft.headers.Authorization = "Basic configured-value";
    draft.payloadOptions.jiraIssue = { ...emptyJiraIssue(), projectKey: "SUP" };

    const request = buildWorkflowDestinationRequest(draft, { email: "", apiToken: "" });

    expect(request.headers.Authorization).toBe("Basic configured-value");
  });

  it("maps only Bitrix24 lead options and strips headers", () => {
    const draft = baseDraft("bitrix24");
    draft.headers.Authorization = "must-not-be-sent";
    draft.webhookUrl = "https://company.bitrix24.com/rest/7/secret/";
    draft.payloadOptions.bitrix24Lead = {
      ...emptyBitrix24Lead(),
      sourceId: "CALL",
      assignedById: 17,
      opened: true,
      additionalFields: { UF_CRM_CALL_ID: "external-value" },
    };

    const request = buildWorkflowDestinationRequest(draft, { email: "", apiToken: "" });

    expect(request.headers).toEqual({});
    expect(request.payloadOptions).toEqual({ bitrix24Lead: draft.payloadOptions.bitrix24Lead });
    expect(sanitizeWorkflowRequest(request).webhookUrl).toBe("Configured webhook URL");
  });
});
