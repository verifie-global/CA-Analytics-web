// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDatasetStudioAccess } from "./useDatasetStudioAccess";
import type { AppSettings } from "./types";
import type { AnnotationDraft } from "./datasetStudioTypes";

const settings: AppSettings = { baseUrl: "https://api.example.test", accessToken: "account-a", apiToken: "", companyId: "42", userId: 7 };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Dataset Studio identity and cache lifetime", () => {
  it.each([1, 2])("ignores changes to the company selector for a server-validated company-%i account", async (companyId) => {
    const fetchMock = vi.fn(async () => json({ id: 7, companyId }));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ context }) => useDatasetStudioAccess(context, true, vi.fn()), { initialProps: { context: settings } });
    const expected = companyId === 1 ? "allowed" : "denied";
    await waitFor(() => expect(result.current.status).toBe(expected));
    const workspace = result.current.workspace;
    rerender({ context: { ...settings, companyId: "1" } });
    expect(result.current.status).toBe(expected);
    rerender({ context: { ...settings, companyId: "99" } });
    expect(result.current.status).toBe(expected);
    expect(result.current.workspace).toBe(workspace);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["accessToken", "userId"] as const)("clears old drafts and cancels pending work when %s changes", async (field) => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ id: 7, companyId: 1 })));
    const { result, rerender } = renderHook(({ context }) => useDatasetStudioAccess(context, true, vi.fn()), { initialProps: { context: settings } });
    await waitFor(() => expect(result.current.status).toBe("allowed"));
    const previous = result.current.workspace!;
    previous.sessionId = "old-session";
    previous.drafts.set("clip", { text: "Private old-account transcript" } as AnnotationDraft);
    rerender({ context: { ...settings, [field]: field === "userId" ? 8 : "account-b" } });
    expect(previous.revoked).toBe(true);
    expect(previous.controller.signal.aborted).toBe(true);
    expect(previous.sessionId).toBe("");
    expect(previous.drafts.size).toBe(0);
    await waitFor(() => expect(result.current.status).toBe("allowed"));
    expect(result.current.workspace).not.toBe(previous);
    expect(result.current.workspace!.drafts.size).toBe(0);
  });

  it("ignores a previous account's late auth/me response", async () => {
    let resolveOld!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve; })).mockImplementation(async () => json({ id: 8, companyId: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ context }) => useDatasetStudioAccess(context, true, vi.fn()), { initialProps: { context: settings } });
    rerender({ context: { ...settings, accessToken: "account-b", userId: 8 } });
    await waitFor(() => expect(result.current.status).toBe("denied"));
    await act(async () => resolveOld(json({ id: 7, companyId: 1 })));
    expect(result.current.status).toBe("denied");
  });
});
