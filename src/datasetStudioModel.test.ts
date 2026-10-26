import { describe, expect, it } from "vitest";
import { annotationBoundaryError, annotationExportBlocker, hasListenedToPreview } from "./datasetStudioModel";
import type { AnnotationSession } from "./datasetStudioTypes";

const ranges = (...intervals: number[][]): TimeRanges => ({
  length: intervals.length, start: (index) => intervals[index][0], end: (index) => intervals[index][1],
});

describe("complete audio listening", () => {
  it("requires actual coverage from the beginning through the end", () => {
    expect(hasListenedToPreview(ranges(), 12)).toBe(false);
    expect(hasListenedToPreview(ranges([11.9, 12]), 12)).toBe(false);
    expect(hasListenedToPreview(ranges([0, 3], [10, 12]), 12)).toBe(false);
    expect(hasListenedToPreview(ranges([0, 11]), 12)).toBe(false);
    expect(hasListenedToPreview(ranges([0, 6], [6, 12]), 12)).toBe(true);
    expect(hasListenedToPreview(ranges([0, 12]), 12)).toBe(true);
    expect(hasListenedToPreview(ranges([0, 12]), NaN)).toBe(false);
    expect(hasListenedToPreview(ranges([0, 12]), Infinity)).toBe(false);
  });
});

describe("recording preview boundaries", () => {
  it("rejects invalid, inverted, out-of-recording, or overlong previews", () => {
    for (const [start, end] of [["", "12"], ["NaN", "12"], ["-1", "12"], ["12", "12"], ["13", "12"], ["0", "61"], ["2", "101"]]) {
      expect(annotationBoundaryError(start, end, 100)).not.toBe("");
    }
    expect(annotationBoundaryError("0.12", "12.88", 100)).toBe("");
    expect(annotationBoundaryError("1", "61", null)).toBe("");
  });
});

describe("dataset export eligibility", () => {
  const session = { recordings: [{ status: "ready", clips: 2, verified: 1, rejected: 1 }] } as AnnotationSession;
  it("requires ready recordings, complete review, a verified clip, and no local edits", () => {
    expect(annotationExportBlocker(session, false)).toBe("");
    expect(annotationExportBlocker(session, true)).toContain("unsaved");
    expect(annotationExportBlocker({ ...session, recordings: [] }, false)).toContain("ready");
    for (const status of ["pending", "transcribing", "failed"] as const) {
      expect(annotationExportBlocker({ ...session, recordings: [{ ...session.recordings[0], status }] }, false)).toContain("ready");
    }
    expect(annotationExportBlocker({ ...session, recordings: [{ ...session.recordings[0], rejected: 0 }] }, false)).toContain("every clip");
    expect(annotationExportBlocker({ ...session, recordings: [{ ...session.recordings[0], verified: 0, rejected: 2 }] }, false)).toContain("at least one");
  });
});
