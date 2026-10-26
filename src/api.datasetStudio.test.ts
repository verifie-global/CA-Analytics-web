import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAnnotationSession, exportAnnotationDataset, fetchAnnotationAudio, fetchAnnotationClips,
  fetchAnnotationSession, fetchAnnotationSessions, fetchAnnotationSources, retryAnnotationRecordings, saveAnnotationClip,
  fetchDatasetStudioIdentity,
  fetchAnnotationSourceCompanies, selectAnnotationSources,
} from "./api";
import type { AppSettings } from "./types";

const settings: AppSettings = { baseUrl: "https://api.example.test/", companyId: "42", accessToken: "jwt", apiToken: "" };
const base = "https://api.example.test/api/companies/1/annotation-sessions";
afterEach(() => vi.unstubAllGlobals());

describe("Dataset Studio API transport", () => {
  it("loads source companies and uses the same ISO filter bounds for browsing and bulk selection", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const filters = { q: "Հայերեն & calls", sourceCompanyId: 42, createdFrom: "2026-10-01T00:00:00.000Z", createdTo: "2026-11-01T00:00:00.000Z" };
    await fetchAnnotationSourceCompanies(settings, controller.signal);
    await fetchAnnotationSources(settings, filters, 2, controller.signal);
    const input = { ...filters, limit: 197, excludeConversationIds: [1, 2, 3] };
    await selectAnnotationSources(settings, input, controller.signal);
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${base}/sources/companies`, expect.objectContaining({ headers: { Authorization: "Bearer jwt" }, signal: controller.signal }));
    const url = new URL((fetchMock.mock.calls as unknown as [string, RequestInit][])[1][0]);
    expect(url.pathname).toBe("/api/companies/1/annotation-sessions/sources");
    expect(Object.fromEntries(url.searchParams)).toEqual({ ...filters, sourceCompanyId: "42", page: "2" });
    expect(fetchMock).toHaveBeenNthCalledWith(3, `${base}/sources/selection`, expect.objectContaining({ method: "POST", body: JSON.stringify(input), headers: { Authorization: "Bearer jwt", "Content-Type": "application/json" }, signal: controller.signal }));
  });
  it("uses company 1 for every annotation endpoint regardless of the selected company", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await fetchAnnotationSources(settings, { q: "Հայերեն & calls", sourceCompanyId: null, createdFrom: null, createdTo: null }, 2, controller.signal);
    await fetchAnnotationSessions(settings);
    await fetchAnnotationSession(settings, "session");
    await fetchAnnotationClips(settings, "session", "rejected", 3);
    await retryAnnotationRecordings(settings, "session");
    const input = { name: "Armenian calls", conversationIds: [1, 51], provider: "gcp" as const, model: "chirp_3", language: "hy" as const, minClipSeconds: 10, maxClipSeconds: 15 };
    await createAnnotationSession(settings, input);
    const update = { text: "Բարև", note: null, status: "verified" as const, revision: "revision-uuid", startSeconds: .12, endSeconds: 12.88, confirmedCorrect: true };
    await saveAnnotationClip(settings, "session", "clip", update);
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${base}/sources?q=${encodeURIComponent("Հայերեն & calls").replace(/%20/g, "+")}&page=2`, expect.objectContaining({ signal: controller.signal, headers: { Authorization: "Bearer jwt" } }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, `${base}/session/clips?status=rejected&page=3`, expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(5, `${base}/session/retry`, expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(6, base, expect.objectContaining({ method: "POST", body: JSON.stringify(input) }));
    expect(fetchMock).toHaveBeenNthCalledWith(7, `${base}/session/clips/clip`, expect.objectContaining({ method: "PUT", body: JSON.stringify(update) }));
    for (const [, options] of fetchMock.mock.calls as unknown as [string, RequestInit][]) expect(options.headers).toMatchObject({ Authorization: "Bearer jwt" });
  });

  it.each([1, "1", 42, "42", "01", "1 ", null, undefined])("reads company membership only from the server auth/me value %s", async (companyId) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 7, companyId }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const identity = await fetchDatasetStudioIdentity({ ...settings, companyId: "1", userRole: "Admin" });
    expect(identity.companyId === "1").toBe(companyId === 1 || companyId === "1");
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/auth/me", expect.objectContaining({ headers: { Authorization: "Bearer jwt" } }));
  });

  it("fetches authenticated WAV previews and preserves encoded ZIP filenames", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response("binary-data", { headers: url.includes("/audio?") ? { "Content-Type": "audio/wav" } : {
      "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=dataset.zip; filename*=UTF-8''%D5%80%D5%A1%D5%B5.zip",
    } }));
    vi.stubGlobal("fetch", fetchMock);
    const audio = await fetchAnnotationAudio(settings, "session", "clip", .12, 12.88);
    expect(audio.type).toBe("audio/wav");
    expect(fetchMock).toHaveBeenCalledWith(`${base}/session/clips/clip/audio?start=0.12&end=12.88`, expect.objectContaining({ headers: { Authorization: "Bearer jwt" } }));
    const result = await exportAnnotationDataset(settings, "session");
    expect(result.fileName).toBe("Հայ.zip");
    expect(result.blob.type).toBe("application/zip");
  });

  it("preserves plain filenames and tolerates malformed encoded filenames", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("zip", { headers: { "Content-Disposition": 'attachment; filename="reviewed calls.zip"; filename*=UTF-8\'\'%invalid' } })));
    expect((await exportAnnotationDataset(settings, "session")).fileName).toBe("reviewed calls.zip");
  });

  it.each([400, 401, 403, 404, 409])("exposes backend messages and HTTP %i for JSON and binary requests", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "The server explains the problem." }), { status })));
    await expect(fetchAnnotationSession(settings, "session")).rejects.toMatchObject({ status, message: "The server explains the problem." });
    await expect(fetchAnnotationAudio(settings, "session", "clip", 0, 12)).rejects.toMatchObject({ status, message: "The server explains the problem." });
    await expect(exportAnnotationDataset(settings, "session")).rejects.toMatchObject({ status, message: "The server explains the problem." });
    await expect(fetchAnnotationSourceCompanies(settings)).rejects.toMatchObject({ status, message: "The server explains the problem." });
    await expect(selectAnnotationSources(settings, { q: "", sourceCompanyId: null, createdFrom: null, createdTo: null, limit: 200, excludeConversationIds: [] })).rejects.toMatchObject({ status, message: "The server explains the problem." });
  });
});
