import { useEffect, useMemo, useState } from "react";
import { formatQaNotApplicableReason, isQaNotApplicable } from "./qaDisplay";
import { QaScoreBadge } from "./QaScoreBadge";
import type { QaQuestionCorrection, QaResult } from "./types";

type QaEvaluationPanelProps = {
  qa?: QaResult | null;
  isCompleted: boolean;
  isRecalculating: boolean;
  onRecalculate: () => void;
  recalculateError?: string;
  generatedAtLabel?: string;
  initiallyExpanded?: boolean;
  onSaveManualCorrection: (
    reason: string,
    questionResults: QaQuestionCorrection[],
  ) => Promise<void>;
};

export function QaEvaluationPanel({
  qa,
  isCompleted,
  isRecalculating,
  onRecalculate,
  recalculateError,
  generatedAtLabel,
  initiallyExpanded = false,
  onSaveManualCorrection,
}: QaEvaluationPanelProps) {
  const evaluation = qa?.evaluation;
  const [isCollapsed, setIsCollapsed] = useState(!initiallyExpanded);
  const qaNotApplicable = isQaNotApplicable(qa);
  const notApplicableReason = formatQaNotApplicableReason(qa?.notApplicableReason);
  const [isEditing, setIsEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { score: 0 | 1; reason: string }>>({});
  const [correctionReason, setCorrectionReason] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDrafts({});
    }
  }, [qa, isEditing]);

  const changedQuestions = useMemo(
    () =>
      (evaluation?.questionResults ?? []).flatMap<QaQuestionCorrection>((question) => {
        const draft = drafts[question.id];
        if (!draft || (draft.score === question.score && draft.reason === question.reason)) {
          return [];
        }
        return [{ id: question.id, score: draft.score, reason: draft.reason }];
      }),
    [drafts, evaluation?.questionResults],
  );

  const preview = useMemo(() => {
    const questions = evaluation?.questionResults ?? [];
    const possiblePoints = questions.reduce((sum, question) => sum + question.weight, 0);
    const earnedPoints = questions.reduce(
      (sum, question) => sum + question.weight * (drafts[question.id]?.score ?? question.score),
      0,
    );
    return {
      earnedPoints,
      possiblePoints,
      score: possiblePoints > 0 ? (earnedPoints / possiblePoints) * 100 : 0,
    };
  }, [drafts, evaluation?.questionResults]);

  const startEditing = () => {
    setDrafts(
      Object.fromEntries(
        (evaluation?.questionResults ?? []).map((question) => [
          question.id,
          { score: question.score > 0 ? 1 : 0, reason: question.reason },
        ]),
      ),
    );
    setCorrectionReason("");
    setSaveError("");
    setSaveSuccess("");
    setIsEditing(true);
  };

  const closeEditing = () => {
    if (changedQuestions.length && !window.confirm("Discard your unsaved QA changes?")) {
      return;
    }
    setIsEditing(false);
    setSaveError("");
  };

  const saveCorrection = async () => {
    if (!correctionReason.trim()) {
      setSaveError("Enter an overall correction reason before saving.");
      return;
    }
    if (!changedQuestions.length) {
      setSaveError("Change at least one question before saving.");
      return;
    }
    setIsSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      await onSaveManualCorrection(correctionReason.trim(), changedQuestions);
      setIsEditing(false);
      setSaveSuccess("QA corrections saved successfully.");
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status === 401 || status === 403) {
        setSaveError("You are not authorized to edit this QA questionnaire.");
      } else if (status === 404) {
        setSaveError("Conversation not found.");
      } else {
        setSaveError(error instanceof Error ? error.message : "Unable to save QA corrections.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!qa && !isCompleted && !recalculateError) {
    return null;
  }

  if (!qa) {
    return (
      <section className="qa-panel qa-panel-compact">
        <div className="detail-header">
          <div>
            <h4>QA evaluation</h4>
          </div>
          <div className="qa-panel-actions">
            {isCompleted ? (
              <button type="button" className="secondary-button small-button" onClick={onRecalculate} disabled={isRecalculating}>
                {isRecalculating ? "Recalculating..." : "Recalculate QA Score"}
              </button>
            ) : null}
            <button
              type="button"
              className="secondary-button small-button qa-collapse-button"
              aria-expanded={!isCollapsed}
              onClick={() => setIsCollapsed((current) => !current)}
            >
              {isCollapsed ? "Show QA" : "Hide QA"}
            </button>
          </div>
        </div>
        {!isCollapsed ? (
          <p className="qa-panel-copy">
            {isCompleted
              ? "QA is not available for this completed call yet. You can trigger recalculation any time."
              : "QA scoring is not available for this call."}
          </p>
        ) : null}
        {recalculateError ? <p className="error-text">{recalculateError}</p> : null}
      </section>
    );
  }

  return (
    <section className="qa-panel">
      <div className="detail-header">
        <div>
          <h4>QA evaluation</h4>
        </div>
        <div className="qa-panel-actions">
          {isCompleted ? (
            <button type="button" className="secondary-button small-button" onClick={onRecalculate} disabled={isRecalculating}>
              {isRecalculating ? "Recalculating..." : "Recalculate QA Score"}
            </button>
          ) : null}
          {!qaNotApplicable && evaluation?.questionResults?.length ? (
            <button
              type="button"
              className="secondary-button small-button"
              onClick={isEditing ? closeEditing : startEditing}
              disabled={isSaving}
            >
              {isEditing ? "Close edit mode" : "Edit QA"}
            </button>
          ) : null}
          <button
            type="button"
            className="secondary-button small-button qa-collapse-button"
            aria-expanded={!isCollapsed}
            onClick={() => setIsCollapsed((current) => !current)}
          >
            {isCollapsed ? "Show QA" : "Hide QA"}
          </button>
        </div>
      </div>

      {!isCollapsed ? (
        <>
          <p className="qa-panel-copy">
            {qaNotApplicable
              ? "This call is not eligible for QA scoring."
              : "Review automatic QA scoring, resolution status, and question-by-question evaluation."}
          </p>
          <div className="qa-panel-body">
            <div className="qa-overview-grid">
              <article className="routing-card">
                <label>{isEditing ? "Preview QA score" : "QA score"}</label>
                <QaScoreBadge
                  score={isEditing ? preview.score : qa.score}
                  isApplicable={qa.isApplicable}
                  status={qa.status}
                  notApplicableReason={qa.notApplicableReason}
                  earnedPoints={isEditing ? preview.earnedPoints : qa.earnedPoints}
                  possiblePoints={isEditing ? preview.possiblePoints : qa.possiblePoints}
                />
              </article>
              <article className="routing-card">
                <label>Earned points</label>
                <strong>{qaNotApplicable ? "N/A" : isEditing ? preview.earnedPoints : qa.earnedPoints ?? "-"}</strong>
              </article>
              <article className="routing-card">
                <label>Possible points</label>
                <strong>{qaNotApplicable ? "N/A" : isEditing ? preview.possiblePoints : qa.possiblePoints ?? "-"}</strong>
              </article>
              <article className="routing-card">
                <label>{qaNotApplicable ? "Reason" : "Resolution status"}</label>
                <strong>{qaNotApplicable ? notApplicableReason || "N/A" : evaluation?.resolutionStatus ?? "N/A"}</strong>
              </article>
            </div>

            {!qaNotApplicable && evaluation?.profileName ? (
              <p className="qa-profile-label">
                <strong>Profile:</strong> {evaluation.profileName}
              </p>
            ) : null}

            {qaNotApplicable && notApplicableReason ? (
              <p className="qa-profile-label">
                <strong>QA not applicable:</strong> {notApplicableReason}
              </p>
            ) : null}

            {!qaNotApplicable && evaluation?.overallComment ? (
              <div className="scroll-panel prose-block">
                {evaluation.overallComment}
              </div>
            ) : null}

            {!qaNotApplicable ? (
              <>
                <div className="qa-insights-grid">
                  <div className="qa-insight-card">
                    <h5>Strengths</h5>
                    {evaluation?.strengths?.length ? (
                      <div className="token-panel">
                        {evaluation.strengths.map((item, index) => (
                          <span key={`strength-${index}`} className="token-chip">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p>No strengths listed.</p>
                    )}
                  </div>

                  <div className="qa-insight-card">
                    <h5>Improvements</h5>
                    {evaluation?.improvements?.length ? (
                      <div className="token-panel">
                        {evaluation.improvements.map((item, index) => (
                          <span key={`improvement-${index}`} className="token-chip">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p>No improvement items listed.</p>
                    )}
                  </div>
                </div>

                <div className="qa-question-results">
                  <h5>Question results</h5>
                  {evaluation?.questionResults?.length ? (
                    evaluation.questionResults.map((question) => {
                      const draft = drafts[question.id];
                      const shownScore = isEditing ? draft?.score ?? question.score : question.score;
                      const passed = shownScore > 0;
                      return (
                        <article key={question.id || question.title} className={`qa-question-result ${draft && (draft.score !== question.score || draft.reason !== question.reason) ? "qa-question-changed" : ""}`}>
                          <div className="qa-question-result-head">
                            <div>
                              <strong>{question.title}</strong>
                              <p>{question.description}</p>
                            </div>
                            <div className="qa-question-score">
                              <span className={`bool-badge ${passed ? "bool-true" : "bool-false"}`}>
                                {passed ? "Pass" : "Fail"}
                              </span>
                              <small>Weight {question.weight}</small>
                            </div>
                          </div>
                          {question.isManuallyCorrected || question.originalScore != null ? (
                            <p className="qa-manual-indicator">
                              Manually corrected
                              {question.originalScore != null
                                ? ` · Original automatic score: ${question.originalScore > 0 ? "Passed" : "Failed"}`
                                : ""}
                            </p>
                          ) : null}
                          {isEditing && draft ? (
                            <div className="qa-question-edit-fields">
                              <label>
                                Result
                                <select
                                  value={draft.score}
                                  onChange={(event) =>
                                    setDrafts((current) => ({
                                      ...current,
                                      [question.id]: {
                                        ...current[question.id],
                                        score: Number(event.target.value) as 0 | 1,
                                      },
                                    }))
                                  }
                                >
                                  <option value={0}>0 — Failed</option>
                                  <option value={1}>1 — Passed</option>
                                </select>
                              </label>
                              <label>
                                Explanation
                                <textarea
                                  rows={3}
                                  value={draft.reason}
                                  onChange={(event) =>
                                    setDrafts((current) => ({
                                      ...current,
                                      [question.id]: { ...current[question.id], reason: event.target.value },
                                    }))
                                  }
                                />
                              </label>
                            </div>
                          ) : (
                            <p><strong>Explanation:</strong> {question.reason || "No explanation provided."}</p>
                          )}
                        </article>
                      );
                    })
                  ) : (
                    <div className="empty-state compact-empty-state">
                      <h3>No QA question results yet</h3>
                      <p>Run QA scoring or wait for the backend to finish evaluating this call.</p>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="qa-correction-footer">
                    <label>
                      Overall correction reason
                      <textarea
                        rows={3}
                        value={correctionReason}
                        onChange={(event) => setCorrectionReason(event.target.value)}
                        placeholder="Why is this questionnaire being corrected?"
                      />
                    </label>
                    <div className="qa-correction-actions">
                      <span>{changedQuestions.length} changed question{changedQuestions.length === 1 ? "" : "s"}</span>
                      <button type="button" className="primary-button" onClick={() => void saveCorrection()} disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save QA corrections"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {!qaNotApplicable && generatedAtLabel ? (
              <p className="qa-generated-label">Generated {generatedAtLabel}</p>
            ) : null}
          </div>
        </>
      ) : null}

      {recalculateError ? <p className="error-text">{recalculateError}</p> : null}
      {saveError ? <p className="error-text" role="alert">{saveError}</p> : null}
      {saveSuccess ? <p className="qa-success-text" role="status">{saveSuccess}</p> : null}
    </section>
  );
}
