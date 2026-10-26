import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAnnotationSession, exportAnnotationDataset, fetchAnnotationAudio, fetchAnnotationClips,
  fetchAnnotationSession, fetchAnnotationSessions, fetchAnnotationSources, retryAnnotationRecordings, saveAnnotationClip,
} from "./api";
import type { AppSettings } from "./types";

const settings: AppSettings = { baseUrl: "https://api.example.test/", companyId: "42", accessToken: "jwt", apiToken: "" };
const base = "https://api.example.test/api/companies/42/annotation-sessions";
afterEach(() => vi.unstubAllGlobals());

describe("Dataset Studio API transport", () => {
  it("uses the shared bearer token, active company, pagination, and review revision", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await fetchAnnotationSources(settings, "Հայերեն & calls", 2, controller.signal);
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
  });
});
