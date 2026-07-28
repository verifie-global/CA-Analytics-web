// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QaEvaluationPanel } from "./QaEvaluationPanel";
import type { QaQuestionResult } from "./types";

afterEach(cleanup);

const result = (
  id: string,
  title: string,
  score: number,
): QaQuestionResult => ({
  id,
  title,
  description: "",
  weight: 15,
  score,
  reason: "",
});

describe("QaEvaluationPanel question ordering", () => {
  it("shows every failed question before passed questions and preserves order within each group", () => {
    const { container } = render(
      <QaEvaluationPanel
        qa={{
          score: 90,
          evaluation: {
            strengths: [],
            improvements: [],
            questionResults: [
              result("pass-one", "Pass one", 1),
              result("fail-one", "Fail one", 0),
              result("pass-two", "Pass two", 1),
              result("fail-two", "Fail two", 0),
            ],
          },
        }}
        isCompleted
        isRecalculating={false}
        onRecalculate={vi.fn()}
        initiallyExpanded
        canManageQaScore={false}
        qaScoreMaximum={120}
        qaScoringMode="subtract_failed_weights"
        onSaveManualCorrection={vi.fn(async () => undefined)}
        onApplicabilityChange={vi.fn(async () => undefined)}
      />,
    );

    const titles = Array.from(
      container.querySelectorAll(
        ".qa-question-result-head > div:first-child > strong",
      ),
      (element) => element.textContent,
    );

    expect(titles).toEqual([
      "Fail one",
      "Fail two",
      "Pass one",
      "Pass two",
    ]);
  });
});
