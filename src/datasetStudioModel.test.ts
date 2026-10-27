import { describe, expect, it } from "vitest";
import { annotationBoundaryError, annotationExportBlocker, formatAnnotationDuration, hasListenedToPreview } from "./datasetStudioModel";
import type { AnnotationSession } from "./datasetStudioTypes";

const ranges = (...intervals: number[][]): TimeRanges => ({
  length: intervals.length, start: (index) => intervals[index][0], end: (index) => intervals[index][1],
});

describe("session audio duration formatting", () => {
  it.each([
    [0, "0m 0s"], [12, "0m 12s"], [60, "1m 0s"], [2530, "42m 10s"],
    [3600, "1h 0m 0s"], [5100, "1h 25m 0s"], [90061, "25h 1m 1s"],
    [59.6, "1m 0s"], [3599.6, "1h 0m 0s"],
  ] as const)("formats %s seconds as %s", (seconds, expected) => {
    expect(formatAnnotationDuration(seconds)).toBe(expected);
  });
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
