// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QaEvaluationPanel } from "./QaEvaluationPanel";
import type { QaQuestionResult } from "./types";
import { createSectionQaResult } from "./qaSectionScoring.testFixtures";

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

const renderSectionPanel = () => {
  const onSaveManualCorrection = vi.fn(async () => undefined);
  const rendered = render(
    <QaEvaluationPanel
      qa={createSectionQaResult()}
      isCompleted
      isRecalculating={false}
      onRecalculate={vi.fn()}
      initiallyExpanded
      canManageQaScore
      qaScoreMaximum={120}
      qaScoringMode="weighted_ratio"
      onSaveManualCorrection={onSaveManualCorrection}
      onApplicabilityChange={vi.fn(async () => undefined)}
    />,
  );
  return { ...rendered, onSaveManualCorrection };
};

describe("QaEvaluationPanel section scoring edits", () => {
  it("preserves the saved score and N/A answers when entering edit mode", () => {
    const view = renderSectionPanel();
    expect(view.getByText("79.17 / 100")).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "Edit QA" }));

    expect(view.getByText("Preview QA score")).toBeTruthy();
    expect(view.getByText("79.17 / 100")).toBeTruthy();
    expect(view.getByText("0 changed questions")).toBeTruthy();
    expect(view.container.querySelectorAll(".qa-question-changed")).toHaveLength(0);
    const excludedQuestion = within(view.getByText("Question a4").closest("article")!);
    expect((excludedQuestion.getByLabelText("Result") as HTMLSelectElement).value).toBe("not_applicable");
    expect(view.onSaveManualCorrection).not.toHaveBeenCalled();
  });

  it("previews the changed section and submits only the edited applicable answer", async () => {
    const view = renderSectionPanel();
    fireEvent.click(view.getByRole("button", { name: "Edit QA" }));
    const questionCard = within(view.getByText("Question a3").closest("article")!);

    fireEvent.change(questionCard.getByLabelText("Result"), { target: { value: "1" } });

    expect(view.getByText("87.5 / 100")).toBeTruthy();
    expect(view.getByText("1 changed question")).toBeTruthy();
    fireEvent.change(view.getByLabelText("Overall correction reason"), {
      target: { value: "Confirmed the evidence." },
    });
    fireEvent.click(view.getByRole("button", { name: "Save QA corrections" }));

    await waitFor(() => expect(view.onSaveManualCorrection).toHaveBeenCalledWith(
      "Confirmed the evidence.",
      [{ id: "a3", score: 1, isApplicable: true, reason: "Reviewed against the transcript." }],
    ));
  });

  it("preserves N/A when only the explanation of an excluded question changes", async () => {
    const view = renderSectionPanel();
    fireEvent.click(view.getByRole("button", { name: "Edit QA" }));
    const questionCard = within(view.getByText("Question a4").closest("article")!);

    fireEvent.change(questionCard.getByLabelText("Explanation"), {
      target: { value: "No transfer was requested during this call." },
    });

    expect(view.getByText("79.17 / 100")).toBeTruthy();
    expect(view.getByText("1 changed question")).toBeTruthy();
    fireEvent.change(view.getByLabelText("Overall correction reason"), {
      target: { value: "Clarified why the criterion is excluded." },
    });
    fireEvent.click(view.getByRole("button", { name: "Save QA corrections" }));

    await waitFor(() => expect(view.onSaveManualCorrection).toHaveBeenCalledWith(
      "Clarified why the criterion is excluded.",
      [{ id: "a4", score: 0, isApplicable: false, reason: "No transfer was requested during this call." }],
    ));
  });

  it("tracks N/A to failed as a change even though both scores are zero", () => {
    const view = renderSectionPanel();
    fireEvent.click(view.getByRole("button", { name: "Edit QA" }));
    const questionCard = within(view.getByText("Question a4").closest("article")!);
    const resultSelect = questionCard.getByLabelText("Result");

    fireEvent.change(resultSelect, { target: { value: "0" } });

    expect(view.getByText("75 / 100")).toBeTruthy();
    expect(view.getByText("1 changed question")).toBeTruthy();
    expect(view.container.querySelectorAll(".qa-question-changed")).toHaveLength(1);

    fireEvent.change(resultSelect, { target: { value: "not_applicable" } });

    expect(view.getByText("79.17 / 100")).toBeTruthy();
    expect(view.getByText("0 changed questions")).toBeTruthy();
    expect(view.container.querySelectorAll(".qa-question-changed")).toHaveLength(0);
    expect(view.onSaveManualCorrection).not.toHaveBeenCalled();
  });

  it("shows an incomplete preview when a section becomes entirely N/A", () => {
    const view = renderSectionPanel();
    fireEvent.click(view.getByRole("button", { name: "Edit QA" }));
    const questionCard = within(view.getByText("Question c1").closest("article")!);

    fireEvent.change(questionCard.getByLabelText("Result"), { target: { value: "not_applicable" } });

    expect(view.getByText("Not scored")).toBeTruthy();
    expect(view.getByText("A QA score requires at least one applicable question in every section.")).toBeTruthy();
    expect(view.queryByText("79.17 / 100")).toBeNull();
    expect(view.getByText("1 changed question")).toBeTruthy();
  });
});

describe("QaEvaluationPanel question ordering", () => {
  it("uses historical scoring defaults when a stored evaluation has no scoring metadata", () => {
    const view = render(
      <QaEvaluationPanel
        qa={{
          score: 50,
          earnedPoints: 15,
          possiblePoints: 30,
          evaluation: {
            strengths: [],
            improvements: [],
            questionResults: [result("passed", "Passed question", 1), result("failed", "Failed question", 0)],
          },
        }}
        isCompleted
        isRecalculating={false}
        onRecalculate={vi.fn()}
        initiallyExpanded
        canManageQaScore
        qaScoreMaximum={120}
        qaScoringMode="subtract_failed_weights"
        onSaveManualCorrection={vi.fn(async () => undefined)}
        onApplicabilityChange={vi.fn(async () => undefined)}
      />,
    );
    expect(view.getByText("50 / 100")).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "Edit QA" }));

    expect(view.getByText("Preview QA score")).toBeTruthy();
    expect(view.getByText("50 / 100")).toBeTruthy();
    expect(view.getByText("0 changed questions")).toBeTruthy();
  });

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
