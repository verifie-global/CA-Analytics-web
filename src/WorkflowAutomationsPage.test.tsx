// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowAutomationsPage } from "./WorkflowAutomationsPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkflowAutomationsPage platform forms", () => {
  it("shows only the fields for the selected platform and protects credential inputs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })),
    );
    const user = userEvent.setup();

    render(
      <WorkflowAutomationsPage
        settings={{ baseUrl: "https://api.example.test", companyId: "1", apiToken: "", accessToken: "token" }}
        onUnauthorized={vi.fn()}
      />,
    );

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
});
