import { describe, expect, it } from "vitest";
import {
  calculateQaScore,
  formatQaScore,
} from "./qaDisplay";
import type { QaQuestionResult } from "./types";

const question = (id: string, weight: number, score: number): QaQuestionResult => ({
  id,
  title: id,
  description: "",
  weight,
  score,
  reason: "",
});

describe("company-configurable QA scoring", () => {
  it("subtracts failed penalties from a 120-point maximum", () => {
    const questions = [
      question("fifteen", 15, 1),
      question("thirty", 30, 1),
    ];

    expect(
      calculateQaScore(
        questions,
        { fifteen: { score: 0 } },
        120,
        "subtract_failed_weights",
      ).score,
    ).toBe(105);
    expect(
      calculateQaScore(
        questions,
        { fifteen: { score: 0 }, thirty: { score: 0 } },
        120,
        "subtract_failed_weights",
      ).score,
    ).toBe(75);
  });

  it("does not clamp negative subtraction results", () => {
    expect(
      calculateQaScore(
        [question("large-penalty", 150, 0)],
        {},
        120,
        "subtract_failed_weights",
      ).score,
    ).toBe(-30);
  });

  it("scales weighted ratios to the configured maximum", () => {
    expect(
      calculateQaScore(
        [question("passed", 15, 1), question("failed", 30, 0)],
        {},
        120,
        "weighted_ratio",
      ).score,
    ).toBe(40);
  });

  it("formats scores against the configured maximum", () => {
    expect(formatQaScore(105, 120)).toBe("105 / 120");
    expect(formatQaScore(-30, 120)).toBe("-30 / 120");
  });
});
