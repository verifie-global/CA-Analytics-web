// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";
import { I18nProvider } from "./i18n";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("updates the uploaded audio in place while keeping the user's selected call and grid intact", async () => {
  localStorage.setItem("ca-analytics-settings", JSON.stringify({
    baseUrl: "https://api.example.test",
    companyId: "42",
    apiToken: "partner-token",
    accessToken: "jwt-token",
    userRole: "Admin",
    preferredLocale: "en",
  }));

  const existingCall = {
    conversationId: "previous-call",
    conversationName: "Previous conversation",
    modality: "text",
    status: "Completed",
    createdUtc: "2026-11-16T09:00:00Z",
  };
  let uploadedConversationId = "";
  let uploadedStatus = "Queued";
  let listRequests = 0;
  let uploadDetailRequests = 0;
  const uploadedCall = () => ({
    conversationId: uploadedConversationId,
    originalAudioFileName: "uploaded.wav",
    source: "audio",
    status: uploadedStatus,
    satisfactionScore: uploadedStatus === "Completed" ? 87 : undefined,
    createdUtc: "2026-11-16T10:00:00Z",
  });

  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const callsPath = "/api/companies/42/calls";
    if (url.pathname === callsPath) {
      listRequests++;
      const items = uploadedConversationId ? [uploadedCall(), existingCall] : [existingCall];
      return json({ items, page: 1, pageSize: 10, total: items.length });
    }
    if (url.pathname === `${callsPath}/${existingCall.conversationId}`) {
      return json({ ...existingCall, transcript: "CUSTOMER: My previous conversation." });
    }
    if (url.pathname.startsWith(`${callsPath}/`) && init?.method === "POST") {
      uploadedConversationId = decodeURIComponent(url.pathname.split("/").at(-1)!);
      return json(uploadedCall(), 202);
    }
    if (uploadedConversationId && url.pathname === `${callsPath}/${uploadedConversationId}`) {
      uploadDetailRequests++;
      return json(uploadedCall());
    }
    return json({});
  }));

  render(<I18nProvider><App /></I18nProvider>);
  await screen.findByText(existingCall.conversationName);
  vi.useFakeTimers();

  fireEvent.click(screen.getByRole("button", { name: "Upload call" }));
  fireEvent.click(screen.getByRole("radio", { name: "Audio file" }));
  fireEvent.change(screen.getByLabelText("Local audio or MOV files"), {
    target: { files: [new File(["audio"], "uploaded.wav", { type: "audio/wav" })] },
  });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Queue analysis" })));

  const grid = screen.getByRole("table", { name: "Conversations" });
  const [uploadedRow, existingRow] = within(grid).getAllByRole("row").slice(1);
  const progress = screen.getByRole("region", { name: "Call analysis progress" });
  expect(within(uploadedRow).getByText("Queued")).toBeTruthy();
  expect(within(progress).getByText("Queued")).toBeTruthy();

  await act(async () => fireEvent.click(existingRow));
  const openTranscript = screen.getByText("My previous conversation.");
  const listRequestsAfterUpload = listRequests;
  const detailRequestsAfterUpload = uploadDetailRequests;
  const advancePoll = () => act(async () => { await vi.advanceTimersByTimeAsync(5000); });

  uploadedStatus = "Processing";
  await advancePoll();
  expect(within(uploadedRow).getByText("Processing")).toBeTruthy();
  expect(within(progress).getByText("Processing")).toBeTruthy();

  await advancePoll();
  expect(uploadDetailRequests).toBe(detailRequestsAfterUpload + 2);
  expect(screen.getByText("My previous conversation.")).toBe(openTranscript);

  uploadedStatus = "Completed";
  await advancePoll();
  expect(within(uploadedRow).getByText("Completed")).toBeTruthy();
  expect(within(uploadedRow).getByText("87")).toBeTruthy();
  expect(within(progress).getByText("Completed")).toBeTruthy();

  await advancePoll();
  expect(uploadDetailRequests).toBe(detailRequestsAfterUpload + 3);
  expect(listRequests).toBe(listRequestsAfterUpload);
  expect(screen.getByRole("table", { name: "Conversations" })).toBe(grid);
  const currentRows = within(grid).getAllByRole("row");
  expect(currentRows[1]).toBe(uploadedRow);
  expect(currentRows[2]).toBe(existingRow);
  expect(screen.getByText("My previous conversation.")).toBe(openTranscript);
});
