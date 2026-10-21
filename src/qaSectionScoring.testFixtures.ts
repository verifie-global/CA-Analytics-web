import type { QaQuestionResult, QaResult } from "./types";

export const createSectionQaQuestions = (): QaQuestionResult[] => {
  const entries: [string, string, number, 0 | 1, boolean][] = [
    ["a1", "a", 6.25, 1, true],
    ["a2", "a", 6.25, 1, true],
    ["a3", "a", 6.25, 0, true],
    ["a4", "a", 6.25, 0, false],
    ["b1", "b", 6.25, 1, true],
    ["b2", "b", 6.25, 0, true],
    ["b3", "b", 6.25, 0, false],
    ["b4", "b", 6.25, 0, false],
    ["c1", "c", 8.33, 1, true],
    ["c2", "c", 8.33, 0, false],
    ["c3", "c", 8.34, 0, false],
    ["d1", "d", 8.33, 1, true],
    ["d2", "d", 8.33, 0, false],
    ["d3", "d", 8.34, 0, false],
  ];
  return entries.map(([id, sectionId, weight, score, isApplicable]) => ({
    id,
    sectionId,
    title: `Question ${id}`,
    description: "",
    weight,
    score,
    isApplicable,
    reason: isApplicable ? "Reviewed against the transcript." : "The condition did not occur.",
  }));
};

export const createQaSections = () =>
  ["a", "b", "c", "d"].map((id) => ({ id, title: `Section ${id}`, weight: 25 }));

export const createSectionQaResult = (): QaResult => ({
  status: "scored",
  isApplicable: true,
  score: 79.17,
  earnedPoints: 79.1666666667,
  possiblePoints: 100,
  evaluation: {
    scoreMaximum: 100,
    scoringMode: "section_weighted_ratio",
    sections: createQaSections(),
    strengths: [],
    improvements: [],
    questionResults: createSectionQaQuestions(),
  },
});
