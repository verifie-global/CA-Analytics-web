// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SttDiagnostics } from "./SttDiagnostics";
import type { SttMetadata } from "./types";

afterEach(cleanup);

describe("STT diagnostics", () => {
  it("renders nothing for old responses without STT metadata", () => {
    const { container } = render(<SttDiagnostics stt={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows Armenian fallback and enhanced-audio selection as valid outcomes", () => {
    const stt: SttMetadata = {
      routing: {
        requestedLanguage: "auto",
        selectedEngine: "nemo-armenian-custom",
        fallbackUsed: true,
      },
      audioQuality: {
        selectedAudio: "sidon",
        decision: "sidon_selected",
        sidon: {
          attempted: true,
          used: true,
          device: "cuda",
          processingTimeSec: 28.415,
        },
        raw: { dnsmos: { sig: 2.1, bak: 1.9, ovrl: 1.8 } },
        enhanced: { dnsmos: { sig: 3.1, bak: 3.2, ovrl: 3 } },
      },
    };
    render(<SttDiagnostics stt={stt} />);

    expect(screen.getByText("Armenian NeMo")).toBeTruthy();
    expect(screen.getByText("Enhanced audio selected")).toBeTruthy();
    const fallbackRow = screen.getByText("Armenian fallback used").parentElement!;
    expect(within(fallbackRow).getByText("Yes")).toBeTruthy();
    expect(screen.getByText("28.415 seconds")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows original-audio selection without treating it as an error", () => {
    render(<SttDiagnostics stt={{
      routing: { selectedEngine: "nemo-parakeet-multilingual", fallbackUsed: false },
      audioQuality: { selectedAudio: "raw", decision: "raw_quality_acceptable" },
    }} />);

    expect(screen.getByText("Multilingual NeMo")).toBeTruthy();
    expect(screen.getByText("Original audio quality was acceptable")).toBeTruthy();
    const audioRow = screen.getByText("Selected audio").parentElement!;
    expect(within(audioRow).getByText("Original")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("handles missing DNSMOS and enhancement fields", () => {
    render(<SttDiagnostics stt={{ routing: { requestedLanguage: "auto" }, audioQuality: {} }} />);
    expect(screen.getByText("STT diagnostics")).toBeTruthy();
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(5);
    expect(screen.getByText("Original audio DNSMOS")).toBeTruthy();
    expect(screen.getByText("Enhanced audio DNSMOS")).toBeTruthy();
  });

  it("safely formats unknown future engine, decision, and audio values", () => {
    render(<SttDiagnostics stt={{
      routing: { selectedEngine: "future_super_engine" },
      audioQuality: { selectedAudio: "spectral-v2", decision: "future_quality_choice" },
    }} />);
    expect(screen.getByText("Future Super Engine")).toBeTruthy();
    expect(screen.getByText("Future Quality Choice")).toBeTruthy();
    expect(screen.getByText("Spectral V2")).toBeTruthy();
  });
});
