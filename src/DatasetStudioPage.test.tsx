// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatasetStudioPage } from "./DatasetStudioPage";
import { createDatasetWorkspace } from "./datasetStudioTypes";
import type { AnnotationClip, AnnotationRecording, AnnotationSession } from "./datasetStudioTypes";
import type { AppSettings } from "./types";

const settings: AppSettings = { baseUrl: "https://api.example.test", companyId: "42", apiToken: "", accessToken: "jwt" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const makeClip = (index: number, status: AnnotationClip["status"] = "pending"): AnnotationClip => ({
  id: `clip-${index}`, recordingId: "recording-1", index, startSeconds: (index - 1) * 12, endSeconds: index * 12,
  originalText: `Original ${index}`, text: `Transcript ${index}`, status, note: null, revision: `revision-${index}`,
  reviewedAt: null, reviewedByUserId: null, recordingDuration: 1000, recordingName: "Support call",
  sourceCompanyId: 42, sourceCompanyName: "Customer company",
});
const recording: AnnotationRecording = { id: "recording-1", conversationId: 1, name: "Support call", companyId: 42, companyName: "Customer company", status: "ready", error: null, durationSeconds: 1000, originalTranscript: "Original", clips: 2, verified: 0, rejected: 0 };

function mockApi(options: { clips?: AnnotationClip[]; recordings?: AnnotationRecording[]; sourceCount?: number; sessionStatus?: number } = {}) {
  let clips = options.clips ?? [makeClip(1), makeClip(2)];
  let recordings = options.recordings ?? [{ ...recording }];
  let conflict = false;
  let deniedPath = "";
  const requests: { url: URL; init?: RequestInit }[] = [];
  const sourceCount = options.sourceCount ?? 51;
  const detail = (): AnnotationSession => ({
    id: "session-1", name: "Armenian support calls", provider: "gcp", model: "chirp_3", language: "hy", createdAt: "2026-10-26T10:00:00Z", minClipSeconds: 10, maxClipSeconds: 15,
    recordings: recordings.map((item) => ({ ...item, clips: clips.filter((clip) => clip.recordingId === item.id).length,
      verified: clips.filter((clip) => clip.recordingId === item.id && clip.status === "verified").length,
      rejected: clips.filter((clip) => clip.recordingId === item.id && clip.status === "rejected").length })),
  });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (deniedPath && url.pathname.endsWith(deniedPath)) return json({ detail: "Annotation access revoked." }, 403);
    if (url.pathname.endsWith("/sources/companies")) return json([{ id: 7, name: "Other company", recordings: 50 }, { id: 42, name: "Customer company", recordings: Math.max(0, sourceCount - 50) }]);
    if (url.pathname.endsWith("/sources")) {
      const page = Number(url.searchParams.get("page"));
      const q = url.searchParams.get("q");
      const sources = Array.from({ length: sourceCount }, (_, index) => ({ id: index + 1, name: `Recording ${index + 1}`, companyId: index >= 50 ? 42 : 7, companyName: index >= 50 ? "Customer company" : "Other company", createdAt: "2026-10-26T10:00:00Z", durationSeconds: index === 0 ? null : 120 })).filter((item) => !q || item.name.toLowerCase().includes(q.toLowerCase()));
      return json({ items: sources.slice((page - 1) * 50, page * 50), total: sources.length, page, pageSize: 50 });
    }
    if (url.pathname.endsWith("/annotation-sessions")) {
      if (init?.method === "POST") return json({ id: "session-1", name: "Armenian support calls" }, 201);
      const session = detail();
      return json([{ ...session, recordings: session.recordings.length, readyRecordings: recordings.filter((item) => item.status === "ready").length,
        failedRecordings: recordings.filter((item) => item.status === "failed").length, clips: clips.length,
        verified: clips.filter((item) => item.status === "verified").length, rejected: clips.filter((item) => item.status === "rejected").length }]);
    }
    if (url.pathname.endsWith("/audio")) return new Response("wav", { headers: { "Content-Type": "audio/wav" } });
    if (url.pathname.endsWith("/export")) return new Response("zip", { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="reviewed-calls.zip"' } });
    if (url.pathname.endsWith("/retry")) {
      const count = recordings.filter((item) => item.status === "failed").length;
      recordings = recordings.map((item) => item.status === "failed" ? { ...item, status: "pending", error: null } : item);
      return json({ retried: count }, 202);
    }
    if (url.pathname.endsWith("/clips")) {
      const filter = url.searchParams.get("status");
      const page = Number(url.searchParams.get("page"));
      const items = clips.filter((clip) => filter === "all" || clip.status === filter);
      return json({ items: items.slice((page - 1) * 50, page * 50), total: items.length, page, pageSize: 50 });
    }
    if (init?.method === "PUT") {
      const id = url.pathname.split("/").at(-1);
      const input = JSON.parse(String(init.body));
      const current = clips.find((clip) => clip.id === id)!;
      if (conflict || input.revision !== current.revision) return json({ error: "Another reviewer saved this clip." }, 409);
      const saved = { ...current, ...input, revision: `${current.revision}-new`, reviewedAt: "2026-10-26T12:00:00Z" };
      clips = clips.map((clip) => clip.id === id ? saved : clip);
      return json({ revision: saved.revision, status: saved.status, reviewedAt: saved.reviewedAt });
    }
    if (options.sessionStatus) return json({ detail: "This session is unavailable." }, options.sessionStatus);
    return json(detail());
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requests, fetchMock, detail, deny: (path: string) => { deniedPath = path; }, setClips: (value: AnnotationClip[]) => { clips = value; }, setRecordings: (value: AnnotationRecording[]) => { recordings = value; }, setConflict: (value: boolean) => { conflict = value; } };
}

function renderSession(onUnauthorized = vi.fn()) {
  const workspace = createDatasetWorkspace();
  workspace.sessionId = "session-1";
  return { workspace, onUnauthorized, ...render(<DatasetStudioPage settings={settings} onUnauthorized={onUnauthorized} workspace={workspace} />) };
}
const editor = () => within(screen.getByRole("region", { name: "Focused clip editor" }));
async function waitForEditor() { await screen.findByLabelText("Corrected transcript"); await screen.findByLabelText("Clip audio preview"); }
function playRanges(intervals: number[][], duration = 12) {
  const audio = screen.getByLabelText("Clip audio preview");
  Object.defineProperty(audio, "duration", { configurable: true, value: duration });
  Object.defineProperty(audio, "played", { configurable: true, value: { length: intervals.length, start: (index: number) => intervals[index][0], end: (index: number) => intervals[index][1] } });
  fireEvent.timeUpdate(audio);
  fireEvent.ended(audio);
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => `blob:preview-${Math.random()}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Dataset Studio session creation", () => {
  it("preserves recording selections through pagination and search, then queues transcription", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    render(<DatasetStudioPage settings={settings} onUnauthorized={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Create session" }));
    await user.type(screen.getByLabelText("Session name"), "Training calls");
    await screen.findByText("Recording 1");
    expect(screen.getAllByText("Other company · Company 7").length).toBe(50);
    expect(screen.getByText(/Duration unavailable/)).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: "Recording 1" }));
    await user.click(screen.getByRole("button", { name: "Next recordings" }));
    await screen.findByText("Recording 51");
    expect(screen.getByText("Customer company · Company 42")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: "Recording 51" }));
    await user.click(screen.getByRole("button", { name: "Previous recordings" }));
    await screen.findByRole("checkbox", { name: "Recording 1" });
    expect((screen.getByRole("checkbox", { name: "Recording 1" }) as HTMLInputElement).checked).toBe(true);
    await user.type(screen.getByLabelText("Search recordings"), "Recording 51");
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));
    expect((screen.getByRole("checkbox", { name: "Recording 51" }) as HTMLInputElement).checked).toBe(true);
    await user.selectOptions(screen.getByLabelText("Language"), "hy");
    await user.click(screen.getByRole("button", { name: "Create & transcribe" }));
    await waitForEditor();
    const request = api.requests.find((entry) => entry.init?.method === "POST")!;
    expect(JSON.parse(String(request.init?.body))).toEqual({ name: "Training calls", conversationIds: [1, 51], provider: "gcp", model: "chirp_3", language: "hy", minClipSeconds: 10, maxClipSeconds: 15 });
  });

  it("restricts OpenAI to whisper-1, shows the retirement notice, and validates duration targets", async () => {
    mockApi();
    const user = userEvent.setup();
    render(<DatasetStudioPage settings={settings} onUnauthorized={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Create session" }));
    await user.selectOptions(screen.getByLabelText("STT provider"), "openai");
    expect(screen.getByText(/February 26, 2027/)).toBeTruthy();
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("whisper-1");
    expect((screen.getByLabelText("Model") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/Selected recordings will be sent to the chosen OpenAI/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Minimum clip seconds"), { target: { value: "20" } });
    expect(screen.getByRole("alert").textContent).toContain("1 ≤ minimum");
    expect((screen.getByRole("button", { name: "Create & transcribe" }) as HTMLButtonElement).disabled).toBe(true);
    await user.selectOptions(screen.getByLabelText("STT provider"), "custom");
    expect((screen.getByLabelText("Model") as HTMLInputElement).value).toBe("");
  });

  it("enforces the 200-recording limit across pages", async () => {
    mockApi({ sourceCount: 201 });
    const user = userEvent.setup();
    render(<DatasetStudioPage settings={settings} onUnauthorized={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Create session" }));
    for (let page = 1; page <= 4; page++) {
      await screen.findByText(`Recording ${(page - 1) * 50 + 1}`);
      await user.click(screen.getByRole("checkbox", { name: "Select this page" }));
      await user.click(screen.getByRole("button", { name: "Next recordings" }));
    }
    await screen.findByText("Recording 201");
    expect(screen.getByText("200 / 200 selected")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Recording 201" }) as HTMLInputElement).disabled).toBe(true);
  });
});

describe("Dataset Studio clip review", () => {
  it("retains Unicode drafts through filters, clip changes, refresh, and page unmounts", async () => {
    mockApi();
    const user = userEvent.setup();
    const { workspace, unmount } = renderSession();
    await waitForEditor();
    fireEvent.change(screen.getByLabelText("Corrected transcript"), { target: { value: "Բարև ձեզ։ Սա ուղղված տեքստն է։" } });
    await user.type(screen.getByLabelText("Review note (optional)"), "Checked Armenian punctuation");
    await user.click(screen.getByRole("button", { name: "Refresh clips" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Refresh clips" }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toContain("Բարև");
    await user.selectOptions(screen.getByLabelText("Clip filter"), "all");
    await waitForEditor();
    await user.click(screen.getByRole("button", { name: /clip 2, Needs review/ }));
    expect((screen.getByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toBe("Transcript 2");
    unmount();
    expect(workspace.drafts.size).toBe(1);
    render(<DatasetStudioPage settings={settings} onUnauthorized={vi.fn()} workspace={workspace} />);
    await waitForEditor();
    expect((screen.getByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toContain("Բարև");
    expect((screen.getByLabelText("Review note (optional)") as HTMLTextAreaElement).value).toBe("Checked Armenian punctuation");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("requires every played interval and explicit confirmation before verifying, then opens the next clip", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    renderSession();
    await waitForEditor();
    const verify = () => screen.getByRole("button", { name: "Verify & next" }) as HTMLButtonElement;
    expect(verify().disabled).toBe(true);
    playRanges([[11.9, 12]]);
    expect(verify().disabled).toBe(true);
    playRanges([[0, 3], [10, 12]]);
    expect(verify().disabled).toBe(true);
    playRanges([[0, 12]]);
    expect(verify().disabled).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: /I listened/ }));
    expect(verify().disabled).toBe(false);
    await user.click(verify());
    await waitFor(() => expect((screen.getByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toBe("Transcript 2"));
    const input = JSON.parse(String(api.requests.find((request) => request.init?.method === "PUT")?.init?.body));
    expect(input).toMatchObject({ status: "verified", confirmedCorrect: true, revision: "revision-1" });
    expect(verify().disabled).toBe(true);
  });

  it("invalidates listening on boundary changes and fetches the exact new authenticated preview", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    renderSession();
    await waitForEditor();
    playRanges([[0, 12]]);
    await user.click(screen.getByRole("checkbox", { name: /I listened/ }));
    fireEvent.change(screen.getByLabelText("End (seconds)"), { target: { value: "9" } });
    expect(screen.queryByLabelText("Clip audio preview")).toBeNull();
    expect((screen.getByRole("button", { name: "Verify & next" }) as HTMLButtonElement).disabled).toBe(true);
    expect(editor().getByText(/Outside the session duration target/)).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Prepare audio preview" }));
    await screen.findByLabelText("Clip audio preview");
    expect(api.requests.some(({ url }) => url.pathname.endsWith("/audio") && url.searchParams.get("end") === "9")).toBe(true);
    playRanges([[0, 9]], 9);
    await user.click(screen.getByRole("checkbox", { name: /I listened/ }));
    expect((screen.getByRole("button", { name: "Verify & next" }) as HTMLButtonElement).disabled).toBe(false);
    const speed = screen.getByLabelText("Playback speed");
    await user.selectOptions(speed, "1.5");
    expect((screen.getByLabelText("Clip audio preview") as HTMLAudioElement).playbackRate).toBe(1.5);
    fireEvent.change(screen.getByLabelText("End (seconds)"), { target: { value: "61" } });
    expect(screen.getByRole("alert").textContent).toContain("60 seconds");
    expect((screen.getByRole("button", { name: "Prepare audio preview" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves drafts as pending, clears verification, sends the latest revision, and rejects clips", async () => {
    const api = mockApi({ clips: [makeClip(1, "verified"), makeClip(2)] });
    const user = userEvent.setup();
    renderSession();
    await user.selectOptions(await screen.findByLabelText("Clip filter"), "all");
    await waitForEditor();
    fireEvent.change(screen.getByLabelText("Corrected transcript"), { target: { value: "Ուղղված տեքստ" } });
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Draft saved. Verification has been cleared.");
    expect(JSON.parse(String(api.requests.find((request) => request.init?.method === "PUT")?.init?.body))).toMatchObject({ status: "pending", confirmedCorrect: false, revision: "revision-1", text: "Ուղղված տեքստ" });
    await user.click(screen.getByRole("button", { name: "Reject clip" }));
    await screen.findByText("Clip rejected.");
    const writes = api.requests.filter((request) => request.init?.method === "PUT");
    expect(JSON.parse(String(writes[1].init?.body))).toMatchObject({ status: "rejected", revision: "revision-1-new", confirmedCorrect: false });
  });

  it("keeps conflicting local text until the reviewer chooses to reload the latest saved version", async () => {
    const api = mockApi();
    api.setConflict(true);
    const user = userEvent.setup();
    const { workspace } = renderSession();
    await waitForEditor();
    fireEvent.change(screen.getByLabelText("Corrected transcript"), { target: { value: "My local correction" } });
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Another reviewer saved this clip.");
    expect((screen.getByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toBe("My local correction");
    expect(workspace.drafts.get("clip-1")?.text).toBe("My local correction");
    api.setClips([{ ...makeClip(1), text: "New remote correction", revision: "remote-revision" }, makeClip(2)]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(screen.getByRole("button", { name: "Reload latest saved version" }));
    expect((screen.getByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toBe("My local correction");
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Reload latest saved version" }));
    await waitFor(() => expect((screen.getByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toBe("New remote correction"));
    expect(workspace.drafts.size).toBe(0);
    api.setConflict(false);
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Draft saved. Verification has been cleared.");
    const writes = api.requests.filter((request) => request.init?.method === "PUT");
    expect(JSON.parse(String(writes.at(-1)?.init?.body)).revision).toBe("remote-revision");
  });

  it("paginates the review queue and restores drafts from an earlier page", async () => {
    mockApi({ clips: Array.from({ length: 51 }, (_, index) => makeClip(index + 1)) });
    const user = userEvent.setup();
    renderSession();
    await waitForEditor();
    fireEvent.change(screen.getByLabelText("Corrected transcript"), { target: { value: "Saved locally" } });
    await user.click(screen.getByRole("button", { name: "Next clips" }));
    await waitFor(() => expect((screen.getByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toBe("Transcript 51"));
    await user.click(screen.getByRole("button", { name: "Previous clips" }));
    await waitFor(() => expect((screen.getByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toBe("Saved locally"));
  });

  it("keeps local edits when a refresh discovers a concurrent saved revision", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    renderSession();
    await waitForEditor();
    fireEvent.change(screen.getByLabelText("Corrected transcript"), { target: { value: "Local words must stay" } });
    api.setClips([{ ...makeClip(1), text: "Remote words", revision: "new-remote-revision" }, makeClip(2)]);
    await user.click(screen.getByRole("button", { name: "Refresh clips" }));
    await screen.findByText("This clip has a conflicting saved version.");
    expect((screen.getByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toBe("Local words must stay");
    expect((screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("stops playback and releases the audio object URL on navigation", async () => {
    mockApi();
    const { unmount } = renderSession();
    await waitForEditor();
    const audio = screen.getByLabelText("Clip audio preview") as HTMLAudioElement;
    const url = audio.src;
    unmount();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(audio.hasAttribute("src")).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
  });
});

describe("Dataset Studio progress, errors, and export", () => {
  it.each(["sessions", "sources", "companies", "selection", "create", "audio", "save", "reload", "clips", "retry", "export"])("clears annotation state on a 403 from %s", async (operation) => {
    const api = mockApi({
      clips: operation === "export" ? [makeClip(1, "verified"), makeClip(2, "rejected")] : undefined,
      recordings: operation === "retry" ? [{ ...recording, status: "failed", error: "Try again" }] : undefined,
    });
    const user = userEvent.setup();
    const workspace = createDatasetWorkspace();
    const onForbidden = vi.fn();
    if (!["sessions", "sources", "companies", "selection", "create"].includes(operation)) workspace.sessionId = "session-1";
    if (operation === "sessions") api.deny("/annotation-sessions");
    if (operation === "audio") api.deny("/audio");
    render(<DatasetStudioPage settings={settings} workspace={workspace} onUnauthorized={vi.fn()} onForbidden={onForbidden} />);
    if (["sources", "companies", "selection", "create"].includes(operation)) {
      if (operation === "sources") api.deny("/sources");
      if (operation === "companies") api.deny("/sources/companies");
      await user.click(await screen.findByRole("button", { name: "Create session" }));
      if (operation === "selection") {
        api.deny("/sources/selection");
        await user.click(screen.getByRole("button", { name: "Select matching — up to 200" }));
      }
      if (operation === "create") {
        await user.click(await screen.findByRole("checkbox", { name: "Recording 1" }));
        fireEvent.change(screen.getByLabelText("Session name"), { target: { value: "All companies" } });
        api.deny("/annotation-sessions");
        await user.click(screen.getByRole("button", { name: "Create & transcribe" }));
      }
    } else if (operation === "export") {
      const button = await screen.findByRole("button", { name: "Export dataset ZIP" });
      await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
      api.deny("/export");
      await user.click(button);
    } else if (operation === "retry") {
      const button = await screen.findByRole("button", { name: "Retry failed recordings" });
      api.deny("/retry");
      await user.click(button);
    } else if (!["sessions", "audio"].includes(operation)) {
      await waitForEditor();
      fireEvent.change(screen.getByLabelText("Corrected transcript"), { target: { value: "Local private draft" } });
      if (operation === "save") {
        api.deny("/clips/clip-1");
        await user.click(screen.getByRole("button", { name: "Save draft" }));
      } else if (operation === "reload") {
        vi.spyOn(window, "confirm").mockReturnValue(true);
        api.deny("/clips");
        await user.click(screen.getByRole("button", { name: "Discard edits and reload saved clip" }));
      } else {
        api.deny("/clips");
        await user.click(screen.getByRole("button", { name: "Refresh clips" }));
      }
    }
    await waitFor(() => expect(onForbidden).toHaveBeenCalledOnce());
    expect(workspace.revoked).toBe(true);
    expect(workspace.controller.signal.aborted).toBe(true);
    expect(workspace.drafts.size).toBe(0);
    expect(workspace.sessionId).toBe("");
    expect(screen.queryByRole("heading", { name: "Dataset Studio" })).toBeNull();
    expect(screen.queryByLabelText("Clip audio preview")).toBeNull();
  });

  it("stops active transcription polling after a 403", async () => {
    vi.useFakeTimers();
    const api = mockApi({ recordings: [{ ...recording, status: "transcribing" }] });
    const { workspace } = renderSession();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.change(screen.getByLabelText("Corrected transcript"), { target: { value: "Do not retain revoked data" } });
    api.deny("/session-1");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(workspace.revoked).toBe(true);
    const count = api.requests.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(api.requests).toHaveLength(count);
    expect(workspace.drafts.size).toBe(0);
  });

  it("shows per-recording errors and retries failed recordings only", async () => {
    const api = mockApi({ recordings: [{ ...recording, status: "failed", error: "STT quota exceeded" }] });
    const user = userEvent.setup();
    renderSession();
    await screen.findByText("STT quota exceeded");
    expect((screen.getByRole("button", { name: "Export dataset ZIP" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Retry failed recordings" }));
    await screen.findByText(/1 failed recording queued/);
    await screen.findByText(/Transcribing 1 recording/);
    expect(api.requests.filter(({ url }) => url.pathname.endsWith("/retry"))).toHaveLength(1);
  });

  it.each([404])("displays backend HTTP %i errors without losing the session workspace", async (status) => {
    mockApi({ sessionStatus: status });
    renderSession();
    expect(await screen.findByText("This session is unavailable.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh Dataset Studio" })).toBeTruthy();
  });

  it("uses the existing sign-in callback for an expired bearer token", async () => {
    mockApi({ sessionStatus: 401 });
    const { onUnauthorized } = renderSession();
    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledOnce());
  });

  it("downloads an authenticated ZIP with the server filename and blocks export with any unsaved edits", async () => {
    const api = mockApi({ clips: [makeClip(1, "verified"), makeClip(2, "rejected")] });
    let filename = "";
    let href = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; href = this.href; });
    const user = userEvent.setup();
    renderSession();
    const exportButton = await screen.findByRole("button", { name: "Export dataset ZIP" }) as HTMLButtonElement;
    await waitFor(() => expect(exportButton.disabled).toBe(false));
    await user.click(exportButton);
    await screen.findByText(/Dataset ZIP downloaded/);
    expect(filename).toBe("reviewed-calls.zip");
    expect(href).toMatch(/^blob:/);
    expect(api.requests.find(({ url }) => url.pathname.endsWith("/export"))?.init?.headers).toMatchObject({ Authorization: "Bearer jwt" });
    await user.selectOptions(screen.getByLabelText("Clip filter"), "all");
    await waitForEditor();
    fireEvent.change(screen.getByLabelText("Corrected transcript"), { target: { value: "Not saved" } });
    expect(exportButton.disabled).toBe(true);
    expect(screen.getByText(/Save or discard all unsaved edits/)).toBeTruthy();
  });

  it("polls about every five seconds without overlap, pauses while hidden, and preserves local edits", async () => {
    vi.useFakeTimers();
    const api = mockApi({ recordings: [{ ...recording, status: "transcribing" }] });
    const { workspace } = renderSession();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByLabelText("Corrected transcript")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Corrected transcript"), { target: { value: "Do not overwrite this draft" } });
    const detailCalls = () => api.requests.filter(({ url }) => url.pathname.endsWith("/session-1")).length;
    expect(detailCalls()).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(detailCalls()).toBe(2);
    expect((screen.getByLabelText("Corrected transcript") as HTMLTextAreaElement).value).toBe("Do not overwrite this draft");
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(detailCalls()).toBe(2);
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(detailCalls()).toBe(3);
    api.setRecordings([{ ...recording, status: "ready" }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    const stopped = detailCalls();
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(detailCalls()).toBe(stopped);
    expect(workspace.drafts.get("clip-1")?.text).toBe("Do not overwrite this draft");
  });

  it("does not start another poll while a slow session request is in flight", async () => {
    vi.useFakeTimers();
    const api = mockApi({ recordings: [{ ...recording, status: "transcribing" }] });
    const response = api.fetchMock.getMockImplementation()!;
    let resolveDetail: ((response: Response) => void) | undefined;
    api.fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveDetail = resolve; }));
    renderSession();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(api.fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { resolveDetail!(json(api.detail())); await vi.advanceTimersByTimeAsync(0); });
    expect(api.fetchMock).toHaveBeenCalledTimes(3); // session, clips, and selected audio
    await act(async () => { await vi.advanceTimersByTimeAsync(4999); });
    expect(api.fetchMock).toHaveBeenCalledTimes(3);
    api.fetchMock.mockImplementation(response);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(api.fetchMock).toHaveBeenCalledTimes(5);
  });
});
