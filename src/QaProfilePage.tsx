import { useEffect, useMemo, useState } from "react";
import { QaQuestionEditor } from "./QaQuestionEditor";
import type { QaProfile, QaQuestionDefinition } from "./types";

type QaProfilePageProps = {
  profile: QaProfile | null;
  loading: boolean;
  saving: boolean;
  errorMessage: string;
  successMessage: string;
  onSave: (profile: QaProfile) => Promise<void>;
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
  loading,
  saving,
  errorMessage,
  successMessage,
  onSave,
}: QaProfilePageProps) {
  const [draftProfile, setDraftProfile] = useState<QaProfile | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setDraftProfile(profile);
    setIsDirty(false);
  }, [profile]);

  const questionErrors = useMemo(() => {
    return (draftProfile?.definition.questions ?? []).map((question) => ({
      title: question.title.trim() ? "" : "Title is required.",
      weight: question.weight > 0 ? "" : "Weight must be greater than 0.",
    }));
  }, [draftProfile]);

  const hasValidationErrors = questionErrors.some((item) => item.title || item.weight);

  const handleSave = async () => {
    if (!draftProfile || hasValidationErrors) {
      return;
    }

    await onSave(draftProfile);
    setIsDirty(false);
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

      <div className="qa-settings-form">
        <div className="qa-settings-grid">
          <label className="keyword-toggle">
            <span>Profile enabled</span>
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
            Profile name
            <input
              value={draftProfile.profileName}
              onChange={(event) => {
                setDraftProfile({ ...draftProfile, profileName: event.target.value });
                setIsDirty(true);
              }}
            />
          </label>

          <label className="full-width">
            Business priorities
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
              {label}
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
