import { describe, expect, it } from "vitest";
import {
  calculateQaScore,
  formatQaScore,
} from "./qaDisplay";
import type { QaQuestionResult } from "./types";
import { createQaSections, createSectionQaQuestions } from "./qaSectionScoring.testFixtures";

const question = (id: string, weight: number, score: number): QaQuestionResult => ({
  id,
  title: id,
  description: "",
  weight,
  score,
  reason: "",
});

describe("section-based QA preview scoring", () => {
  it("preserves 79.17 when raw passed-question weights total 35.41", () => {
    const questions = createSectionQaQuestions();
    expect(questions.reduce((sum, item) => sum + item.weight * item.score, 0)).toBeCloseTo(35.41);

    const result = calculateQaScore(questions, {}, 100, "section_weighted_ratio", createQaSections());

    expect(result.score).toBeCloseTo(79.17, 2);
    expect(result.earnedPoints).toBeCloseTo(79.1666666667, 8);
    expect(result.possiblePoints).toBe(100);
  });

  it("updates only the affected section when a failed answer is changed", () => {
    const result = calculateQaScore(
      createSectionQaQuestions(),
      { a3: { score: 1, isApplicable: true } },
      100,
      "section_weighted_ratio",
      createQaSections(),
    );

    expect(result.score).toBe(87.5);
    expect(result.earnedPoints).toBe(87.5);
    expect(result.possiblePoints).toBe(100);
  });

  it("keeps an excluded question out of the calculation even when its score is passing", () => {
    const result = calculateQaScore(
      createSectionQaQuestions(),
      { a4: { score: 1, isApplicable: false } },
      100,
      "section_weighted_ratio",
      createQaSections(),
    );

    expect(result.score).toBeCloseTo(79.17, 2);
    expect(result.possiblePoints).toBe(100);
  });

  it("marks the total incomplete when a section has no applicable questions", () => {
    const result = calculateQaScore(
      createSectionQaQuestions(),
      { c1: { score: 0, isApplicable: false } },
      100,
      "section_weighted_ratio",
      createQaSections(),
    );

    expect(result.score).toBeNull();
    expect(result.earnedPoints).toBeCloseTo(54.1666666667, 8);
    expect(result.possiblePoints).toBe(100);
  });

  it("uses section weights independently of the configured score maximum", () => {
    const result = calculateQaScore(
      [
        { ...question("a1", 1, 1), sectionId: "a", isApplicable: true },
        { ...question("b1", 1, 0), sectionId: "b", isApplicable: true },
        { ...question("b2", 3, 1), sectionId: "b", isApplicable: true },
      ],
      {},
      120,
      "section_weighted_ratio",
      [
        { id: "a", title: "A", weight: 1 },
        { id: "b", title: "B", weight: 3 },
      ],
    );

    expect(result.score).toBe(97.5);
    expect(result.earnedPoints).toBe(3.25);
    expect(result.possiblePoints).toBe(4);
  });

  it("does not invent a preview score when section metadata is absent or inconsistent", () => {
    const questions = createSectionQaQuestions();
    expect(calculateQaScore(questions, {}, 100, "section_weighted_ratio").score).toBeNull();

    questions[0].sectionId = "missing-section";
    expect(calculateQaScore(questions, {}, 100, "section_weighted_ratio", createQaSections()).score).toBeNull();
  });

  it("matches section IDs without case sensitivity like the backend", () => {
    const questions = createSectionQaQuestions().map((item) => ({
      ...item,
      sectionId: item.sectionId?.toUpperCase(),
    }));

    const result = calculateQaScore(questions, {}, 100, "section_weighted_ratio", createQaSections());

    expect(result.score).toBe(79.17);
    expect(result.earnedPoints).toBeCloseTo(79.1666666667, 8);
    expect(result.possiblePoints).toBe(100);
  });
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
