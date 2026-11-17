// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowAutomationsPage } from "./WorkflowAutomationsPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const workflowEndpoint = "https://api.example.test/api/companies/1/workflow-destinations";
const savedAmoCrmDestination = {
  id: "12",
  name: "Support calls",
  platform: "amocrm",
  webhookUrl: "https://company.amocrm.ru",
  headers: {},
  hasAuthorization: true,
  payloadOptions: {
    customFields: { source: "imported-workflow" },
    amoCrmLead: {
      name: "Pending callbacks",
      pipelineId: 100,
      tags: ["existing", "support"],
      createCustomerContact: false,
      customFields: [{ fieldId: 205, value: { codes: ["A", "B"] }, enumCode: "WORK" }],
    },
  },
};

function renderWorkflows() {
  render(
    <WorkflowAutomationsPage
      settings={{ baseUrl: "https://api.example.test", companyId: "1", apiToken: "", accessToken: "token" }}
      onUnauthorized={vi.fn()}
    />,
  );
  return userEvent.setup();
}

function mockWorkflowApi(existing: (typeof savedAmoCrmDestination)[] = []) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.body) return Response.json(existing);
    return Response.json({
      ...JSON.parse(String(init.body)),
      id: savedAmoCrmDestination.id,
      headers: {},
      hasAuthorization: true,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("WorkflowAutomationsPage platform forms", () => {
  it("shows only the fields for the selected platform and protects credential inputs", async () => {
    mockWorkflowApi();
    const user = renderWorkflows();

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Create workflow" }).length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole("button", { name: "Create workflow" })[0]);

    const platform = screen.getByLabelText("Platform");
    expect(screen.getByRole("option", { name: "Zapier" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Make" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "n8n" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Pipedream" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Power Automate" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Custom Webhook" })).toBeTruthy();
    await user.selectOptions(platform, "jira");
    expect(screen.getByTestId("jira-fields")).toBeTruthy();
    expect(screen.queryByTestId("bitrix24-fields")).toBeNull();
    expect(screen.getByLabelText("Jira API token")).toHaveProperty("type", "password");

    await user.selectOptions(platform, "bitrix24");
    expect(screen.queryByTestId("jira-fields")).toBeNull();
    expect(screen.getByTestId("bitrix24-fields")).toBeTruthy();
    expect(screen.getByLabelText("Incoming webhook URL")).toHaveProperty("type", "password");
  }, 15_000);

  it("creates a native amoCRM workflow and warns about real deals before sending a test", async () => {
    const fetchMock = mockWorkflowApi();
    const user = renderWorkflows();
    await user.click(screen.getAllByRole("button", { name: "Create workflow" })[0]);
    await user.selectOptions(screen.getByLabelText("Platform"), screen.getByRole("option", { name: "amoCRM" }));
    expect(screen.queryByText("Headers", { exact: true })).toBeNull();
    expect(screen.queryByText("Payload options", { exact: true })).toBeNull();

    const token = screen.getByLabelText("amoCRM access token");
    expect(token).toHaveProperty("type", "password");
    expect(screen.getByRole("checkbox", { name: "Create a contact from the customer's name and phone" })).toHaveProperty("checked", false);
    await user.type(screen.getByLabelText("Name"), "Support workflow");
    await user.type(screen.getByLabelText("amoCRM account URL"), "https://company.amocrm.ru");
    const createButton = within(token.closest("form")!).getByRole("button", { name: "Create workflow" });
    expect(createButton).toHaveProperty("disabled", true);
    await user.type(token, "demo-access-token");
    await user.type(screen.getByLabelText("Deal title"), "Follow-up call");
    await user.type(screen.getByLabelText("Pipeline ID"), "100");
    await user.type(screen.getByLabelText("Stage ID"), "200");
    await user.type(screen.getByLabelText("Responsible user ID"), "300");
    await user.type(screen.getByLabelText("Deal value"), "0");
    await user.type(screen.getByLabelText("Analysis summary field ID"), "400");
    await user.type(screen.getByLabelText("Full transcript field ID"), "500");
    await user.type(screen.getByLabelText(/Tags/), "support, , call-analytics ");
    await user.click(screen.getByRole("checkbox", { name: "negative" }));
    await user.click(createButton);

    await screen.findByText("Workflow automation created.");
    const [url, init] = fetchMock.mock.calls.find(([, options]) => options?.method === "POST")!;
    expect(url).toBe(workflowEndpoint);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      name: "Support workflow",
      platform: "amocrm",
      webhookUrl: "https://company.amocrm.ru",
      headers: { Authorization: "Bearer demo-access-token" },
      isEnabled: true,
      filters: { sentiments: ["negative"] },
      payloadOptions: {
        amoCrmLead: {
          name: "Follow-up call",
          pipelineId: 100,
          statusId: 200,
          responsibleUserId: 300,
          price: 0,
          tags: ["support", "call-analytics"],
          analysisSummaryFieldId: 400,
          transcriptFieldId: 500,
          createCustomerContact: false,
        },
      },
    });

    await user.click(screen.getByRole("button", { name: "Test Integration" }));
    expect(screen.getByText("Sending a test can create or update a real amoCRM deal.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([requestUrl]) => requestUrl.endsWith("/test"))).toBe(false);
  }, 15_000);

  it("keeps the saved token and custom fields when editing within the same amoCRM origin", async () => {
    const fetchMock = mockWorkflowApi([savedAmoCrmDestination]);
    const user = renderWorkflows();
    await user.click(await screen.findByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("amoCRM access token")).toHaveProperty("value", "");
    expect(screen.getByText("Leave blank to keep the saved token.")).toBeTruthy();
    expect(screen.getByLabelText("Deal title")).toHaveProperty("value", "Pending callbacks");
    expect(screen.getByLabelText(/Tags/)).toHaveProperty("value", "existing, support");

    const accountUrl = screen.getByLabelText("amoCRM account URL");
    await user.clear(accountUrl);
    await user.type(accountUrl, "https://COMPANY.amocrm.ru:443/");
    await user.click(screen.getByRole("checkbox", { name: "Create a contact from the customer's name and phone" }));
    await user.click(screen.getByRole("button", { name: "Save workflow" }));

    await screen.findByText("Workflow automation updated.");
    const [url, init] = fetchMock.mock.calls.find(([, options]) => options?.method === "PATCH")!;
    expect(url).toBe(`${workflowEndpoint}/12`);
    const patch = JSON.parse(String(init?.body));
    expect(patch).not.toHaveProperty("headers");
    expect(patch).not.toHaveProperty("hasAuthorization");
    expect(patch.payloadOptions).toMatchObject({
      customFields: savedAmoCrmDestination.payloadOptions.customFields,
      amoCrmLead: { ...savedAmoCrmDestination.payloadOptions.amoCrmLead, createCustomerContact: true },
    });
  }, 15_000);

  it("requires HTTPS and a replacement token after the amoCRM account origin changes", async () => {
    const fetchMock = mockWorkflowApi([savedAmoCrmDestination]);
    const user = renderWorkflows();
    await user.click(await screen.findByRole("button", { name: "Edit" }));

    const accountUrl = screen.getByLabelText("amoCRM account URL");
    const save = screen.getByRole("button", { name: "Save workflow" });
    await user.clear(accountUrl);
    await user.type(accountUrl, "http://other.amocrm.ru");
    expect(screen.getByText(/Enter an HTTPS amoCRM account URL/)).toBeTruthy();
    expect(save).toHaveProperty("disabled", true);

    await user.clear(accountUrl);
    await user.type(accountUrl, "https://other.amocrm.ru");
    expect(screen.getByText("Enter a new access token for the changed amoCRM account.")).toBeTruthy();
    expect(save).toHaveProperty("disabled", true);
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);

    await user.type(screen.getByLabelText("amoCRM access token"), "replacement-token");
    await user.click(save);
    await screen.findByText("Workflow automation updated.");

    const [url, init] = fetchMock.mock.calls.find(([, options]) => options?.method === "PATCH")!;
    expect(url).toBe(`${workflowEndpoint}/12`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      platform: "amocrm",
      webhookUrl: "https://other.amocrm.ru",
      headers: { Authorization: "Bearer replacement-token" },
    });
  }, 15_000);
});
