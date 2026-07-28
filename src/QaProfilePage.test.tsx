// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QaProfilePage } from "./QaProfilePage";
import type { QaProfile, QaScoringSettings } from "./types";

afterEach(cleanup);

const profile: QaProfile = {
  companyId: 1,
  isConfigured: true,
  isEnabled: true,
  profileName: "Calls for AI",
  qaScoreMaximum: 120,
  qaScoringMode: "subtract_failed_weights",
  definition: {
    businessContext: "",
    mainGoalOfCallEvaluation: "",
    businessPriorities: [],
    targetBusinessOutcome: "",
    sentimentRules: "",
    satisfactionRules: "",
    friendlinessRules: "",
    resolutionRules: "",
    urgencyRules: "",
    departmentRules: "",
    complianceRules: "",
    additionalInstructions: "",
    questions: [
      {
        id: "greeting",
        title: "Greeting",
        description: "",
        weight: 15,
        isEnabled: true,
      },
    ],
  },
};

const scoringSettings: QaScoringSettings = {
  companyId: 1,
  isConfigured: true,
  isEnabled: true,
  qaScoreMaximum: 120,
  qaScoringMode: "subtract_failed_weights",
  minScorableCallDurationSeconds: null,
  repeatContactAutoPassEnabled: false,
};

const renderPage = (onSaveQaScoringSettings = vi.fn(async () => undefined)) => {
  render(
    <QaProfilePage
      profile={profile}
      qaScoringSettings={scoringSettings}
      loading={false}
      saving={false}
      qaScoringSettingsLoading={false}
      qaScoringSettingsSaving={false}
      errorMessage=""
      successMessage=""
      qaScoringSettingsErrorMessage=""
      qaScoringSettingsSuccessMessage=""
      onSave={vi.fn(async () => undefined)}
      onSaveQaScoringSettings={onSaveQaScoringSettings}
    />,
  );

  return onSaveQaScoringSettings;
};

describe("QaProfilePage scoring settings", () => {
  it("shows subtraction mode and preserves returned question weights", () => {
    renderPage();

    expect(
      (screen.getByLabelText("Scoring method") as HTMLSelectElement).value,
    ).toBe("subtract_failed_weights");
    expect(
      screen.getByText(
        "Question weights are failure penalties and are subtracted from the maximum score.",
      ),
    ).toBeTruthy();
    expect((screen.getByLabelText("Weight") as HTMLInputElement).value).toBe(
      "15",
    );
  });

  it("saves the selected method together with all other current settings", async () => {
    const user = userEvent.setup();
    const onSave = renderPage();

    await user.selectOptions(
      screen.getByLabelText("Scoring method"),
      "weighted_ratio",
    );
    await user.click(
      screen.getByRole("button", { name: "Save QA scoring settings" }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        qaScoreMaximum: 120,
        qaScoringMode: "weighted_ratio",
        minScorableCallDurationSeconds: null,
        repeatContactAutoPassEnabled: false,
      }),
    );
  });

  it("rejects a maximum above 9999.99", async () => {
    const user = userEvent.setup();
    renderPage();

    const maximumInput = screen.getByLabelText("Maximum QA score");
    await user.clear(maximumInput);
    await user.type(maximumInput, "10000");

    expect(
      screen.getByText("Maximum QA score cannot exceed 9999.99."),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Save QA scoring settings",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
