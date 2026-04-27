import { QaScoreBadge } from "./QaScoreBadge";
import type { QaResult } from "./types";

type QaEvaluationPanelProps = {
  qa?: QaResult | null;
  isCompleted: boolean;
  isRecalculating: boolean;
  onRecalculate: () => void;
  recalculateError?: string;
  generatedAtLabel?: string;
};

export function QaEvaluationPanel({
  qa,
  isCompleted,
  isRecalculating,
  onRecalculate,
  recalculateError,
  generatedAtLabel,
}: QaEvaluationPanelProps) {
  const evaluation = qa?.evaluation;

  if (!qa && !recalculateError) {
    return null;
  }

  return (
    <section className="qa-panel">
      <div className="detail-header">
        <div>
          <h4>QA evaluation</h4>
          <p className="qa-panel-copy">
            Review automatic QA scoring, resolution status, and question-by-question evaluation.
          </p>
        </div>
        {isCompleted ? (
          <button type="button" className="secondary-button" onClick={onRecalculate} disabled={isRecalculating}>
            {isRecalculating ? "Recalculating..." : "Recalculate QA Score"}
          </button>
        ) : null}
      </div>

      {qa ? (
        <div className="qa-panel-body">
          <div className="qa-overview-grid">
            <article className="routing-card">
              <label>QA score</label>
              <QaScoreBadge
                score={qa.score}
                earnedPoints={qa.earnedPoints}
                possiblePoints={qa.possiblePoints}
              />
            </article>
            <article className="routing-card">
              <label>Earned points</label>
              <strong>{qa.earnedPoints ?? "-"}</strong>
            </article>
            <article className="routing-card">
              <label>Possible points</label>
              <strong>{qa.possiblePoints ?? "-"}</strong>
            </article>
            <article className="routing-card">
              <label>Resolution status</label>
              <strong>{evaluation?.resolutionStatus ?? "N/A"}</strong>
            </article>
          </div>

          {evaluation?.profileName ? (
            <p className="qa-profile-label">
              <strong>Profile:</strong> {evaluation.profileName}
            </p>
          ) : null}

          {evaluation?.overallComment ? (
            <div className="scroll-panel prose-block">
              {evaluation.overallComment}
            </div>
          ) : null}

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
                const passed = question.score > 0;
                return (
                  <article key={question.id || question.title} className="qa-question-result">
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
                    <p>
                      <strong>Reason:</strong> {question.reason || "No reason provided."}
                    </p>
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

          {generatedAtLabel ? (
            <p className="qa-generated-label">Generated {generatedAtLabel}</p>
          ) : null}
        </div>
      ) : null}

      {recalculateError ? <p className="error-text">{recalculateError}</p> : null}
    </section>
  );
}
