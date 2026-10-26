// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatasetTranscriptionSettings } from "./DatasetTranscriptionSettings";
import { annotationOptionsFixture } from "./datasetStudio.testFixtures";
import type { AppSettings } from "./types";

const settings: AppSettings = { baseUrl: "https://api.example.test", companyId: "42", apiToken: "", accessToken: "jwt" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function pendingOptions() {
  let resolve!: (response: Response) => void;
  const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>((done) => { resolve = done; }));
  vi.stubGlobal("fetch", fetchMock);
  const controller = new AbortController();
  const callbacks = { onChange: vi.fn(), onUnauthorized: vi.fn(), onForbidden: vi.fn() };
  const result = render(<DatasetTranscriptionSettings settings={settings} signal={controller.signal} {...callbacks} />);
  return { ...result, ...callbacks, controller, fetchMock, resolve: (response: Response) => resolve(response) };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Dataset Studio transcription options lifecycle", () => {
  it("blocks transcription settings until API models and defaults have loaded", async () => {
    const view = pendingOptions();
    expect((screen.getByLabelText("STT provider") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Model") as HTMLSelectElement).disabled).toBe(true);
    expect(view.onChange.mock.calls).toEqual([[null]]);
    await act(async () => view.resolve(json({ providers: [{ provider: "openai", models: ["future-model", "alternate"], defaultModel: "future-model" }] })));
    expect((screen.getByLabelText("STT provider") as HTMLSelectElement).value).toBe("openai");
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("future-model");
    expect((screen.getByLabelText("Model") as HTMLSelectElement).disabled).toBe(false);
    expect(view.onChange).toHaveBeenLastCalledWith({ provider: "openai", model: "future-model" });
  });

  it.each(["close", "account change"])("ignores successful options arriving after %s", async (operation) => {
    const view = pendingOptions();
    if (operation === "close") view.unmount();
    else view.controller.abort();
    expect(view.fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    view.onChange.mockClear();
    await act(async () => view.resolve(json(annotationOptionsFixture)));
    expect(view.onChange).not.toHaveBeenCalled();
  });

  it.each([401, 403])("ignores late HTTP %i from a previous account", async (status) => {
    const view = pendingOptions();
    view.controller.abort();
    await act(async () => view.resolve(json({ detail: "Previous account access denied." }, status)));
    expect(view.onUnauthorized).not.toHaveBeenCalled();
    expect(view.onForbidden).not.toHaveBeenCalled();
    expect(view.onChange.mock.calls).toEqual([[null]]);
  });
});
