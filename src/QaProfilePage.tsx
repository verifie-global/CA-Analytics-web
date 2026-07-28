import { useEffect, useMemo, useState } from "react";
import { QaQuestionEditor } from "./QaQuestionEditor";
import {
  DEFAULT_QA_SCORE_MAXIMUM,
  DEFAULT_QA_SCORING_MODE,
} from "./qaDisplay";
import type {
  QaProfile,
  QaQuestionDefinition,
  QaScoringMode,
  QaScoringSettings,
  QaScoringSettingsUpdate,
} from "./types";

type QaProfilePageProps = {
  profile: QaProfile | null;
  qaScoringSettings: QaScoringSettings | null;
  loading: boolean;
  saving: boolean;
  qaScoringSettingsLoading: boolean;
  qaScoringSettingsSaving: boolean;
  errorMessage: string;
  successMessage: string;
  qaScoringSettingsErrorMessage: string;
  qaScoringSettingsSuccessMessage: string;
  onSave: (profile: QaProfile) => Promise<void>;
  onSaveQaScoringSettings: (update: QaScoringSettingsUpdate) => Promise<void>;
};

const createQuestionId = () =>
  `question-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const createEmptyQuestion = (): QaQuestionDefinition => ({
  id: createQuestionId(),
  title: "",
  description: "",
  weight: 10,
  isEnabled: true,
});

const splitPriorities = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

type QaTextareaFieldKey =
  | "businessContext"
  | "mainGoalOfCallEvaluation"
  | "targetBusinessOutcome"
  | "sentimentRules"
  | "satisfactionRules"
  | "friendlinessRules"
  | "resolutionRules"
  | "urgencyRules"
  | "departmentRules"
  | "complianceRules"
  | "additionalInstructions";

const qaDefinitionFields: Array<{ key: QaTextareaFieldKey; label: string }> = [
  { key: "businessContext", label: "Business context" },
  { key: "mainGoalOfCallEvaluation", label: "Main goal of call evaluation" },
  { key: "targetBusinessOutcome", label: "Target business outcome" },
  { key: "sentimentRules", label: "Sentiment rules" },
  { key: "satisfactionRules", label: "Satisfaction rules" },
  { key: "friendlinessRules", label: "Friendliness rules" },
  { key: "resolutionRules", label: "Resolution rules" },
  { key: "urgencyRules", label: "Urgency rules" },
  { key: "departmentRules", label: "Department rules" },
  { key: "complianceRules", label: "Compliance rules" },
  { key: "additionalInstructions", label: "Additional instructions" },
];

export function QaProfilePage({
  profile,
  qaScoringSettings,
  loading,
  saving,
  qaScoringSettingsLoading,
  qaScoringSettingsSaving,
  errorMessage,
  successMessage,
  qaScoringSettingsErrorMessage,
  qaScoringSettingsSuccessMessage,
  onSave,
  onSaveQaScoringSettings,
}: QaProfilePageProps) {
  const [draftProfile, setDraftProfile] = useState<QaProfile | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [qaScoreMaximumDraft, setQaScoreMaximumDraft] = useState(
    String(DEFAULT_QA_SCORE_MAXIMUM),
  );
  const [qaScoringModeDraft, setQaScoringModeDraft] =
    useState<QaScoringMode>(DEFAULT_QA_SCORING_MODE);
  const [durationDraft, setDurationDraft] = useState("");
  const [scoringSettingsDirty, setScoringSettingsDirty] = useState(false);
  const [repeatContactAutoPassEnabledDraft, setRepeatContactAutoPassEnabledDraft] =
    useState(false);

  useEffect(() => {
    setDraftProfile(profile);
    setIsDirty(false);
  }, [profile]);

  useEffect(() => {
    setQaScoreMaximumDraft(
      String(
        qaScoringSettings?.qaScoreMaximum ??
          profile?.qaScoreMaximum ??
          DEFAULT_QA_SCORE_MAXIMUM,
      ),
    );
    setQaScoringModeDraft(
      qaScoringSettings?.qaScoringMode ??
        profile?.qaScoringMode ??
        DEFAULT_QA_SCORING_MODE,
    );
    const duration = qaScoringSettings?.minScorableCallDurationSeconds;
    setDurationDraft(duration == null ? "" : String(duration));
    setRepeatContactAutoPassEnabledDraft(
      qaScoringSettings?.repeatContactAutoPassEnabled ?? false,
    );
    setScoringSettingsDirty(false);
  }, [profile?.qaScoreMaximum, profile?.qaScoringMode, qaScoringSettings]);

  const questionErrors = useMemo(() => {
    return (draftProfile?.definition.questions ?? []).map((question) => ({
      title: question.title.trim() ? "" : "Title is required.",
      weight: question.weight > 0 ? "" : "Weight must be greater than 0.",
    }));
  }, [draftProfile]);

  const hasValidationErrors = questionErrors.some((item) => item.title || item.weight);
  const parsedQaScoreMaximum = Number(qaScoreMaximumDraft);
  const qaScoreMaximumValidationError =
    qaScoreMaximumDraft.trim() === "" ||
    !Number.isFinite(parsedQaScoreMaximum) ||
    parsedQaScoreMaximum <= 0
      ? "Maximum QA score must be greater than 0."
      : parsedQaScoreMaximum > 9999.99
        ? "Maximum QA score cannot exceed 9999.99."
        : "";
  const trimmedDurationDraft = durationDraft.trim();
  const parsedDuration =
    trimmedDurationDraft === "" ? null : Number(trimmedDurationDraft);
  const durationValidationError =
    parsedDuration != null && (!Number.isFinite(parsedDuration) || parsedDuration < 0)
      ? "Enter a non-negative number of seconds."
      : "";

  const handleSave = async () => {
    if (!draftProfile || hasValidationErrors) {
      return;
    }

    await onSave(draftProfile);
    setIsDirty(false);
  };

  const handleSaveQaScoringSettings = async () => {
    if (qaScoreMaximumValidationError || durationValidationError) {
      return;
    }

    await onSaveQaScoringSettings({
      qaScoreMaximum: parsedQaScoreMaximum,
      qaScoringMode: qaScoringModeDraft,
      minScorableCallDurationSeconds: parsedDuration,
      repeatContactAutoPassEnabled: repeatContactAutoPassEnabledDraft,
    });
    setScoringSettingsDirty(false);
  };

  if (loading && !draftProfile) {
    return (
      <section className="panel qa-settings-panel">
        <div className="empty-state">
          <h3>Loading QA profile</h3>
          <p>Fetching your company QA tuning profile.</p>
        </div>
      </section>
    );
  }

  if (!draftProfile) {
    return (
      <section className="panel qa-settings-panel">
        <div className="empty-state">
          <h3>QA profile not available</h3>
          <p>We could not load the current QA profile.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel qa-settings-panel">
      <div className="section-heading">
        <h2>Company QA Profile</h2>
        <p>Configure the business rules and weighted questions used to score company conversations.</p>
      </div>

      <div className="qa-scoring-settings-block">
        <div className="editor-group-head">
          <div>
            <h3>QA scoring</h3>
          </div>
        </div>

        <div className="qa-settings-grid qa-scoring-settings-grid">
          <label className="full-width">
            <span className="qa-field-label">Maximum QA score</span>
            <input
              type="number"
              min="0.01"
              max="9999.99"
              step="0.01"
              value={qaScoreMaximumDraft}
              aria-label="Maximum QA score"
              onChange={(event) => {
                setQaScoreMaximumDraft(event.target.value);
                setScoringSettingsDirty(true);
              }}
              aria-invalid={Boolean(qaScoreMaximumValidationError)}
              disabled={qaScoringSettingsLoading || qaScoringSettingsSaving}
            />
            <small className="qa-field-helper">
              Sets the maximum score used for company QA evaluations.
            </small>
          </label>

          <label className="full-width">
            <span className="qa-field-label">Scoring method</span>
            <select
              value={qaScoringModeDraft}
              aria-label="Scoring method"
              onChange={(event) => {
                setQaScoringModeDraft(event.target.value as QaScoringMode);
                setScoringSettingsDirty(true);
              }}
              disabled={qaScoringSettingsLoading || qaScoringSettingsSaving}
            >
              <option value="weighted_ratio">Weighted percentage</option>
              <option value="subtract_failed_weights">
                Subtract failed-question weights
              </option>
            </select>
            <small className="qa-field-helper">
              {qaScoringModeDraft === "subtract_failed_weights"
                ? "Score = maximum QA score − failed-question weights."
                : "Score = passed weight ÷ total enabled weight × maximum QA score."}
            </small>
          </label>

          <label className="full-width">
            <span className="qa-field-label">Minimum call duration for QA scoring</span>
            <input
              type="number"
              min="0"
              step="1"
              value={durationDraft}
              onChange={(event) => {
                setDurationDraft(event.target.value);
                setScoringSettingsDirty(true);
              }}
              placeholder="No minimum"
              disabled={qaScoringSettingsLoading || qaScoringSettingsSaving}
            />
            <small className="qa-field-helper">
              Calls shorter than this duration will be marked as QA not applicable.
            </small>
          </label>

          <label className="qa-scoring-toggle full-width">
            <span>
              <span className="qa-field-label">Enable second-call detection</span>
              <small className="qa-field-helper">
                When enabled, repeat or follow-up calls can automatically pass
                repeat-sensitive QA checks such as customer name, source, need discovery,
                preferences, appointment CTA, and WhatsApp follow-up.
              </small>
            </span>
            <input
              type="checkbox"
              checked={repeatContactAutoPassEnabledDraft}
              onChange={(event) => {
                setRepeatContactAutoPassEnabledDraft(event.target.checked);
                setScoringSettingsDirty(true);
              }}
              disabled={qaScoringSettingsLoading || qaScoringSettingsSaving}
            />
          </label>
        </div>

        {qaScoringSettingsLoading ? (
          <p className="qa-settings-status">Loading QA scoring settings...</p>
        ) : null}
        {qaScoreMaximumValidationError ? (
          <p className="field-error">{qaScoreMaximumValidationError}</p>
        ) : null}
        {durationValidationError ? <p className="field-error">{durationValidationError}</p> : null}
        {qaScoringSettingsErrorMessage ? (
          <p className="error-text">{qaScoringSettingsErrorMessage}</p>
        ) : null}
        {qaScoringSettingsSuccessMessage ? (
          <p className="qa-success-text">{qaScoringSettingsSuccessMessage}</p>
        ) : null}
        {qaScoringSettingsSuccessMessage ? (
          <p className="qa-settings-notice" role="status">
            Existing calls keep their current QA score until recalculated.
          </p>
        ) : null}

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setQaScoreMaximumDraft(
                String(
                  qaScoringSettings?.qaScoreMaximum ??
                    profile?.qaScoreMaximum ??
                    DEFAULT_QA_SCORE_MAXIMUM,
                ),
              );
              setQaScoringModeDraft(
                qaScoringSettings?.qaScoringMode ??
                  profile?.qaScoringMode ??
                  DEFAULT_QA_SCORING_MODE,
              );
              const duration = qaScoringSettings?.minScorableCallDurationSeconds;
              setDurationDraft(duration == null ? "" : String(duration));
              setRepeatContactAutoPassEnabledDraft(
                qaScoringSettings?.repeatContactAutoPassEnabled ?? false,
              );
              setScoringSettingsDirty(false);
            }}
            disabled={!scoringSettingsDirty || qaScoringSettingsSaving}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => void handleSaveQaScoringSettings()}
            disabled={
              qaScoringSettingsSaving ||
              qaScoringSettingsLoading ||
              Boolean(qaScoreMaximumValidationError) ||
              Boolean(durationValidationError)
            }
          >
            {qaScoringSettingsSaving ? "Saving..." : "Save QA scoring settings"}
          </button>
        </div>
      </div>

      <div className="qa-settings-form">
        <div className="qa-settings-grid">
          <label className="keyword-toggle">
            <span className="qa-field-label">Profile enabled</span>
            <input
              type="checkbox"
              checked={draftProfile.isEnabled}
              onChange={(event) => {
                setDraftProfile({ ...draftProfile, isEnabled: event.target.checked });
                setIsDirty(true);
              }}
            />
          </label>

          <label>
            <span className="qa-field-label">Profile name</span>
            <input
              value={draftProfile.profileName}
              onChange={(event) => {
                setDraftProfile({ ...draftProfile, profileName: event.target.value });
                setIsDirty(true);
              }}
            />
          </label>

          <label className="full-width">
            <span className="qa-field-label">Business priorities</span>
            <input
              value={draftProfile.definition.businessPriorities.join(", ")}
              onChange={(event) => {
                setDraftProfile({
                  ...draftProfile,
                  definition: {
                    ...draftProfile.definition,
                    businessPriorities: splitPriorities(event.target.value),
                  },
                });
                setIsDirty(true);
              }}
              placeholder="Customer satisfaction, Compliance"
            />
          </label>

          {qaDefinitionFields.map(({ key, label }) => (
            <label key={key} className="full-width">
              <span className="qa-field-label">{label}</span>
              <textarea
                rows={4}
                value={draftProfile.definition[key]}
                onChange={(event) => {
                  setDraftProfile({
                    ...draftProfile,
                    definition: {
                      ...draftProfile.definition,
                      [key]: event.target.value,
                    },
                  });
                  setIsDirty(true);
                }}
              />
            </label>
          ))}
        </div>

        <div className="qa-question-editor-list">
          <div className="editor-group-head">
            <h3>Weighted questions</h3>
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() => {
                setDraftProfile({
                  ...draftProfile,
                  definition: {
                    ...draftProfile.definition,
                    questions: [...draftProfile.definition.questions, createEmptyQuestion()],
                  },
                });
                setIsDirty(true);
              }}
            >
              Add question
            </button>
          </div>

          {qaScoringModeDraft === "subtract_failed_weights" ? (
            <p className="qa-settings-notice" role="note">
              Question weights are failure penalties and are subtracted from the maximum score.
            </p>
          ) : null}

          {draftProfile.definition.questions.map((question, index) => (
            <QaQuestionEditor
              key={question.id || `question-${index}`}
              question={question}
              index={index}
              titleError={questionErrors[index]?.title}
              weightError={questionErrors[index]?.weight}
              onChange={(nextQuestion) => {
                const nextQuestions = [...draftProfile.definition.questions];
                nextQuestions[index] = nextQuestion;
                setDraftProfile({
                  ...draftProfile,
                  definition: {
                    ...draftProfile.definition,
                    questions: nextQuestions,
                  },
                });
                setIsDirty(true);
              }}
              onDelete={() => {
                setDraftProfile({
                  ...draftProfile,
                  definition: {
                    ...draftProfile.definition,
                    questions: draftProfile.definition.questions.filter((_, currentIndex) => currentIndex !== index),
                  },
                });
                setIsDirty(true);
              }}
            />
          ))}
        </div>

        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
        {successMessage ? <p className="qa-success-text">{successMessage}</p> : null}
        {successMessage ? (
          <p className="qa-settings-notice" role="status">
            Existing calls keep their current QA score until recalculated.
          </p>
        ) : null}

        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setDraftProfile(profile);
              setIsDirty(false);
            }}
            disabled={!isDirty || saving}
          >
            Reset
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={saving || hasValidationErrors}>
            {saving ? "Saving..." : "Save QA profile"}
          </button>
        </div>
      </div>
    </section>
  );
}
