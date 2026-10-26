// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatasetCreateSession } from "./DatasetCreateSession";
import type { AnnotationSource, AnnotationSourceFilters, AnnotationSourceSelectionInput } from "./datasetStudioTypes";
import type { AppSettings } from "./types";
import { annotationOptionsFixture } from "./datasetStudio.testFixtures";

const settings: AppSettings = { baseUrl: "https://api.example.test", companyId: "42", accessToken: "company-1-user", apiToken: "" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const isoDate = (date: string) => new Date(`${date}T00:00:00`).toISOString();
const records: AnnotationSource[] = Array.from({ length: 250 }, (_, index) => ({
  id: index + 1, name: `Recording ${index + 1}`, companyId: index % 2 ? 42 : 7, companyName: index % 2 ? "Beta" : "Alpha",
  createdAt: new Date(Date.UTC(2026, 9, 26, 12) - index * 3600000).toISOString(), durationSeconds: 120,
}));
const matching = (filters: AnnotationSourceFilters) => records.filter((record) =>
  (!filters.q || record.name.toLowerCase().includes(filters.q.toLowerCase())) &&
  (filters.sourceCompanyId === null || record.companyId === filters.sourceCompanyId) &&
  (filters.createdFrom === null || record.createdAt >= filters.createdFrom) &&
  (filters.createdTo === null || record.createdAt < filters.createdTo));
const selectionResult = (ids: number[], totalAvailable = ids.length, truncated = false) => json({
  conversationIds: ids, totalMatching: totalAvailable, totalAvailable, selected: ids.length, truncated, limit: 200,
});
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

function mockApi() {
  const requests: { url: URL; init?: RequestInit }[] = [];
  let companyStatus = 200;
  let bulkHandler: ((input: AnnotationSourceSelectionInput) => Response | Promise<Response>) | null = null;
  let sourcesHandler: ((url: URL) => Response | Promise<Response> | null) | null = null;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.pathname.endsWith("/options")) return json(annotationOptionsFixture);
    if (url.pathname.endsWith("/sources/companies")) return json(companyStatus === 200
      ? [{ id: 7, name: "Alpha", recordings: 125 }, { id: 42, name: "Beta", recordings: 125 }]
      : { detail: "Company options unavailable." }, companyStatus);
    if (url.pathname.endsWith("/sources/selection")) {
      const body = JSON.parse(String(init?.body)) as AnnotationSourceSelectionInput;
      if (bulkHandler) return bulkHandler(body);
      const matches = matching(body);
      const available = matches.filter((item) => !body.excludeConversationIds.includes(item.id));
      const ids = available.slice(0, body.limit).map((item) => item.id);
      return json({ conversationIds: ids, totalMatching: matches.length, totalAvailable: available.length, selected: ids.length, truncated: available.length > ids.length, limit: body.limit });
    }
    if (url.pathname.endsWith("/sources")) {
      const custom = sourcesHandler?.(url);
      if (custom) return custom;
      const matches = matching({ q: url.searchParams.get("q") ?? "", sourceCompanyId: url.searchParams.has("sourceCompanyId") ? Number(url.searchParams.get("sourceCompanyId")) : null, createdFrom: url.searchParams.get("createdFrom"), createdTo: url.searchParams.get("createdTo") });
      const page = Number(url.searchParams.get("page"));
      return json({ items: matches.slice((page - 1) * 50, page * 50), total: matches.length, page, pageSize: 50 });
    }
    if (url.pathname.endsWith("/annotation-sessions") && init?.method === "POST") return json({ id: "session", name: "Training calls" }, 201);
    throw new Error(`Unexpected test request: ${url}`);
  }));
  return {
    requests,
    bulk: () => requests.filter(({ url }) => url.pathname.endsWith("/sources/selection")),
    creations: () => requests.filter(({ url, init }) => url.pathname.endsWith("/annotation-sessions") && init?.method === "POST"),
    setBulkHandler: (handler: typeof bulkHandler) => { bulkHandler = handler; },
    setSourcesHandler: (handler: typeof sourcesHandler) => { sourcesHandler = handler; },
    setCompanyStatus: (status: number) => { companyStatus = status; },
  };
}

function renderCreate(overrides: Partial<AppSettings> = {}) {
  const access = new AbortController();
  const onCreated = vi.fn();
  const onCancel = vi.fn();
  const onForbidden = vi.fn();
  const onUnauthorized = vi.fn();
  return { access, onCreated, onCancel, onForbidden, onUnauthorized,
    ...render(<DatasetCreateSession settings={{ ...settings, ...overrides }} signal={access.signal} onCreated={onCreated} onCancel={onCancel} onForbidden={onForbidden} onUnauthorized={onUnauthorized} />) };
}
const pageCheckbox = () => screen.getByRole("checkbox", { name: "Select this page" }) as HTMLInputElement;
const counter = (count: number) => expect(screen.getByText(`${count} / 200 selected`)).toBeTruthy();
const bulkButton = (remaining: number) => screen.getByRole("button", { name: `Select matching — up to ${remaining}` });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Dataset Studio bulk recording selection", () => {
  it("shows partial, full, and empty page checkbox states and retains selections across pages and filters", async () => {
    mockApi();
    const user = userEvent.setup();
    renderCreate();
    await screen.findByRole("checkbox", { name: "Recording 1" });
    expect(pageCheckbox().checked).toBe(false);
    expect(pageCheckbox().indeterminate).toBe(false);
    await user.click(screen.getByRole("checkbox", { name: "Recording 1" }));
    expect(pageCheckbox().indeterminate).toBe(true);
    expect(pageCheckbox().getAttribute("aria-checked")).toBe("mixed");
    counter(1);
    await user.click(pageCheckbox());
    counter(50);
    expect(pageCheckbox().checked).toBe(true);
    expect(pageCheckbox().indeterminate).toBe(false);
    await user.click(screen.getByRole("button", { name: "Next recordings" }));
    counter(50);
    await screen.findByRole("checkbox", { name: "Recording 51" });
    expect(pageCheckbox().checked).toBe(false);
    await user.click(screen.getByRole("checkbox", { name: "Recording 51" }));
    counter(51);
    await user.selectOptions(screen.getByLabelText("Source company"), "42");
    await screen.findByRole("checkbox", { name: "Recording 2" });
    counter(51);
    expect((screen.getByRole("checkbox", { name: "Recording 2" }) as HTMLInputElement).checked).toBe(true);
    await user.selectOptions(screen.getByLabelText("Source company"), "");
    await screen.findByRole("checkbox", { name: "Recording 1" });
    expect(pageCheckbox().checked).toBe(true);
    await user.click(pageCheckbox());
    counter(1); // Recording 51 is still selected on another page.
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    counter(0);
    expect(pageCheckbox().checked).toBe(false);
    expect(pageCheckbox().indeterminate).toBe(false);
  });

  it("selects the newest matches across all pages, reports truncation, and transcribes only on explicit creation", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    const { onCreated } = renderCreate();
    await screen.findByRole("checkbox", { name: "Recording 1" });
    fireEvent.change(screen.getByLabelText("Session name"), { target: { value: "Training calls" } });
    await user.click(bulkButton(200));
    await screen.findByText("200 / 200 selected");
    expect(screen.getByText(/Added 200 matching recordings. 50 additional matching recordings did not fit/)).toBeTruthy();
    expect(api.creations()).toHaveLength(0);
    expect(onCreated).not.toHaveBeenCalled();
    expect((bulkButton(0) as HTMLButtonElement).disabled).toBe(true);
    expect(pageCheckbox().checked).toBe(true);
    expect(pageCheckbox().disabled).toBe(false);
    const body = JSON.parse(String(api.bulk()[0].init?.body));
    expect(body).toEqual({ q: "", sourceCompanyId: null, createdFrom: null, createdTo: null, limit: 200, excludeConversationIds: [] });
    expect(api.requests.every(({ url }) => url.pathname.startsWith("/api/companies/1/annotation-sessions"))).toBe(true);
    await user.click(screen.getByRole("button", { name: "Create & transcribe" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("session"));
    expect(JSON.parse(String(api.creations()[0].init?.body)).conversationIds).toEqual(records.slice(0, 200).map((item) => item.id));
  });

  it("extends the selection using remaining capacity and current exclusions, skipping duplicate returned IDs", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole("checkbox", { name: "Recording 1" }));
    api.setBulkHandler(() => selectionResult([1, 51, 51, 60]));
    await user.click(bulkButton(199));
    await screen.findByText("3 / 200 selected");
    expect(JSON.parse(String(api.bulk()[0].init?.body))).toMatchObject({ limit: 199, excludeConversationIds: [1] });
    expect(screen.getByText(/Added 2 matching recordings across all pages/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next recordings" }));
    const source = await screen.findByRole("checkbox", { name: "Recording 51" });
    expect((source as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Recording 60" }) as HTMLInputElement).checked).toBe(true);
    counter(3);
  });

  it("preserves the entire selection if selecting a page would exceed the limit, including the partial checkbox state", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole("checkbox", { name: "Recording 1" }));
    api.setBulkHandler(() => selectionResult(Array.from({ length: 198 }, (_, index) => 1000 + index)));
    await user.click(bulkButton(199));
    await screen.findByText("199 / 200 selected");
    await user.click(pageCheckbox());
    counter(199);
    expect(pageCheckbox().indeterminate).toBe(true);
    expect(screen.getByText(/Selecting this page would add 49 recordings and exceed/)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Recording 2" }) as HTMLInputElement).checked).toBe(false);
  });

  it("allows deselecting individual recordings and the whole page when full", async () => {
    mockApi();
    const user = userEvent.setup();
    renderCreate();
    await screen.findByRole("checkbox", { name: "Recording 1" });
    await user.click(bulkButton(200));
    await screen.findByText("200 / 200 selected");
    const first = screen.getByRole("checkbox", { name: "Recording 1" }) as HTMLInputElement;
    expect(first.disabled).toBe(false);
    await user.click(first);
    counter(199);
    await user.click(first);
    counter(200);
    await user.click(pageCheckbox());
    counter(150);
    expect(first.checked).toBe(false);
  });

  it("sends the same search, source-company, and inclusive/exclusive ISO date filters for browsing and bulk selection", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole("checkbox", { name: "Recording 1" }));
    await user.click(screen.getByRole("button", { name: "Next recordings" }));
    await screen.findByRole("checkbox", { name: "Recording 51" });
    fireEvent.change(screen.getByLabelText("Search recordings"), { target: { value: " Recording " } });
    await user.selectOptions(screen.getByLabelText("Source company"), "42");
    fireEvent.change(screen.getByLabelText("Recorded from (inclusive)"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Recorded before (exclusive)"), { target: { value: "2026-10-27" } });
    await waitFor(() => expect(api.requests.some(({ url }) => url.pathname.endsWith("/sources") && url.searchParams.get("createdTo") === isoDate("2026-10-27"))).toBe(true));
    const filters = { q: "Recording", sourceCompanyId: 42, createdFrom: isoDate("2026-10-20"), createdTo: isoDate("2026-10-27") };
    const last = api.requests.filter(({ url }) => url.pathname.endsWith("/sources")).at(-1)!.url;
    expect(Object.fromEntries(last.searchParams)).toEqual({ q: "Recording", sourceCompanyId: "42", createdFrom: filters.createdFrom, createdTo: filters.createdTo, page: "1" });
    counter(1);
    await user.click(bulkButton(199));
    const expected = matching(filters);
    await screen.findByText(`${expected.length + 1} / 200 selected`);
    expect(JSON.parse(String(api.bulk()[0].init?.body))).toEqual({ ...filters, limit: 199, excludeConversationIds: [1] });
  });

  it("validates reversed or empty date ranges without losing selected recordings", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole("checkbox", { name: "Recording 1" }));
    fireEvent.change(screen.getByLabelText("Recorded from (inclusive)"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Recorded before (exclusive)"), { target: { value: "2026-10-20" } });
    expect(screen.getByRole("alert").textContent).toContain("must be later");
    counter(1);
    expect((bulkButton(199) as HTMLButtonElement).disabled).toBe(true);
    await user.click(bulkButton(199));
    expect(api.bulk()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Recorded before (exclusive)"), { target: { value: "2026-10-21" } });
    await waitFor(() => expect((bulkButton(199) as HTMLButtonElement).disabled).toBe(false));
    counter(1);
  });

  it("retains selections through company-option, recording-list, and bulk-selection failures and retries", async () => {
    const api = mockApi();
    api.setCompanyStatus(500);
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole("checkbox", { name: "Recording 1" }));
    expect(screen.getByText("Company options unavailable.")).toBeTruthy();
    counter(1);
    api.setCompanyStatus(200);
    await user.click(screen.getByRole("button", { name: "Retry source companies" }));
    await screen.findByRole("option", { name: "Beta (125 recordings)" });
    api.setSourcesHandler(() => json({ detail: "Recordings temporarily unavailable." }, 500));
    fireEvent.change(screen.getByLabelText("Search recordings"), { target: { value: "Recording" } });
    await screen.findByText("Recordings temporarily unavailable.");
    counter(1);
    api.setSourcesHandler(null);
    await user.click(screen.getByRole("button", { name: "Retry recordings" }));
    await screen.findByRole("checkbox", { name: "Recording 1" });
    api.setBulkHandler(() => json({ detail: "Bulk selection temporarily unavailable." }, 500));
    await user.click(bulkButton(199));
    await screen.findByText("Bulk selection temporarily unavailable.");
    counter(1);
    api.setBulkHandler(null);
    await user.click(screen.getByRole("button", { name: "Retry matching selection" }));
    await screen.findByText("200 / 200 selected");
    expect(JSON.parse(String(api.bulk().at(-1)!.init?.body))).toMatchObject({ limit: 199, excludeConversationIds: [1] });
  });

  it("clear selection cancels a pending bulk request and ignores its late result", async () => {
    const api = mockApi();
    const pending = deferred();
    api.setBulkHandler(() => pending.promise);
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole("checkbox", { name: "Recording 1" }));
    fireEvent.change(screen.getByLabelText("Session name"), { target: { value: "Training" } });
    await user.click(bulkButton(199));
    expect((screen.getByRole("button", { name: "Create & transcribe" }) as HTMLButtonElement).disabled).toBe(true);
    expect(pageCheckbox().disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    counter(0);
    expect(api.bulk()[0].init?.signal?.aborted).toBe(true);
    await act(async () => pending.resolve(selectionResult([2, 3])));
    counter(0);
    expect(api.creations()).toHaveLength(0);
  });

  it("ignores a stale bulk response after filters change, then uses the new filters and existing exclusions", async () => {
    const api = mockApi();
    const pending = deferred();
    api.setBulkHandler(() => pending.promise);
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole("checkbox", { name: "Recording 1" }));
    await user.click(bulkButton(199));
    fireEvent.change(screen.getByLabelText("Search recordings"), { target: { value: "Recording 51" } });
    expect(api.bulk()[0].init?.signal?.aborted).toBe(true);
    await act(async () => pending.resolve(selectionResult([2, 3])));
    counter(1);
    await screen.findByRole("checkbox", { name: "Recording 51" });
    api.setBulkHandler(null);
    await user.click(bulkButton(199));
    await screen.findByText("2 / 200 selected");
    expect(JSON.parse(String(api.bulk()[1].init?.body))).toMatchObject({ q: "Recording 51", limit: 199, excludeConversationIds: [1] });
  });

  it("does not let an older response clear the busy state of a newer selection request", async () => {
    const api = mockApi();
    const old = deferred();
    const current = deferred();
    api.setBulkHandler(() => old.promise);
    const user = userEvent.setup();
    renderCreate();
    await screen.findByRole("checkbox", { name: "Recording 1" });
    await user.click(bulkButton(200));
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    api.setBulkHandler(() => current.promise);
    await user.click(bulkButton(200));
    await act(async () => old.resolve(selectionResult([1])));
    counter(0);
    expect((screen.getByRole("button", { name: "Selecting matching recordings…" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => current.resolve(selectionResult([2])));
    counter(1);
    expect(bulkButton(199)).toBeTruthy();
  });

  it.each(["closing the selector", "switching accounts"])("aborts pending selection and ignores late responses after %s", async (reason) => {
    const api = mockApi();
    const pending = deferred();
    api.setBulkHandler(() => pending.promise);
    const user = userEvent.setup();
    const first = renderCreate();
    await screen.findByRole("checkbox", { name: "Recording 1" });
    await user.click(bulkButton(200));
    if (reason === "switching accounts") first.access.abort();
    else await user.click(screen.getByRole("button", { name: "Cancel" }));
    first.unmount();
    const second = renderCreate({ accessToken: reason === "switching accounts" ? "another-company-1-user" : settings.accessToken });
    expect(api.bulk()[0].init?.signal?.aborted).toBe(true);
    await act(async () => pending.resolve(reason === "switching accounts" ? json({ detail: "Old account forbidden" }, 403) : selectionResult([1, 2, 3])));
    counter(0);
    expect(first.onCreated).not.toHaveBeenCalled();
    expect(first.onForbidden).not.toHaveBeenCalled();
    expect(second.onCreated).not.toHaveBeenCalled();
    expect(second.onForbidden).not.toHaveBeenCalled();
  });

  it("ignores stale recording pages after filters change while keeping earlier selections", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole("checkbox", { name: "Recording 1" }));
    const old = deferred();
    api.setSourcesHandler((url) => url.searchParams.get("q") === "old query" ? old.promise : null);
    fireEvent.change(screen.getByLabelText("Search recordings"), { target: { value: "old query" } });
    await waitFor(() => expect(api.requests.some(({ url }) => url.searchParams.get("q") === "old query")).toBe(true));
    fireEvent.change(screen.getByLabelText("Search recordings"), { target: { value: "Recording 51" } });
    await screen.findByRole("checkbox", { name: "Recording 51" });
    await act(async () => old.resolve(json({ items: [records[0]], total: 1, page: 1, pageSize: 50 })));
    expect(screen.queryByRole("checkbox", { name: "Recording 1" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Recording 51" })).toBeTruthy();
    counter(1);
  });

  it("does not start transcription when Enter is pressed in a recording filter", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    renderCreate();
    await user.click(await screen.findByRole("checkbox", { name: "Recording 1" }));
    fireEvent.change(screen.getByLabelText("Session name"), { target: { value: "Training" } });
    await user.type(screen.getByLabelText("Search recordings"), "Recording{Enter}");
    expect(api.creations()).toHaveLength(0);
    expect(api.bulk()).toHaveLength(0);
    counter(1);
  });
});
