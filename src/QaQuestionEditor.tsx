import type { QaQuestionDefinition } from "./types";

type QaQuestionEditorProps = {
  question: QaQuestionDefinition;
  index: number;
  onChange: (nextQuestion: QaQuestionDefinition) => void;
  onDelete: () => void;
  titleError?: string;
  weightError?: string;
};

export function QaQuestionEditor({
  question,
  index,
  onChange,
  onDelete,
  titleError,
  weightError,
}: QaQuestionEditorProps) {
  return (
    <article className="qa-question-editor">
      <div className="editor-group-head">
        <h3>Question {index + 1}</h3>
        <button type="button" className="secondary-button small-button" onClick={onDelete}>
          Delete
        </button>
      </div>

      <div className="grid-form qa-question-grid">
        <label>
          <span className="qa-field-label">Question ID</span>
          <input
            value={question.id}
            onChange={(event) => onChange({ ...question, id: event.target.value })}
            placeholder="custom_question_id"
          />
        </label>

        <label>
          <span className="qa-field-label">Weight</span>
          <input
            type="number"
            min="1"
            value={question.weight}
            onChange={(event) =>
              onChange({ ...question, weight: Number(event.target.value) || 0 })
            }
          />
          {weightError ? <span className="field-error">{weightError}</span> : null}
        </label>

        <label className="full-width">
          <span className="qa-field-label">Title</span>
          <input
            value={question.title}
            onChange={(event) => onChange({ ...question, title: event.target.value })}
            placeholder="Greeting and introduction"
          />
          {titleError ? <span className="field-error">{titleError}</span> : null}
        </label>

        <label className="full-width">
          <span className="qa-field-label">Description</span>
          <textarea
            rows={3}
            value={question.description}
            onChange={(event) => onChange({ ...question, description: event.target.value })}
            placeholder="The agent opened the call professionally."
          />
        </label>

        <label className="keyword-toggle">
          <span className="qa-field-label">Enabled</span>
          <input
            type="checkbox"
            checked={question.isEnabled}
            onChange={(event) => onChange({ ...question, isEnabled: event.target.checked })}
          />
        </label>
      </div>
    </article>
  );
}
