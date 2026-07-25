import { useRef, useState } from "react";
import type { QaResult } from "./types";

type QaApplicabilityControlProps = {
  qa?: QaResult | null;
  isCompleted: boolean;
  onChange: (isApplicable: boolean, reason?: string) => Promise<void>;
};

const getErrorMessage = (error: unknown) => {
  const status = (error as Error & { status?: number })?.status;
  if (status === 403 || status === 404) {
    return "Call not found or you do not have access.";
  }
  if (status === 401) {
    return "";
  }
  return error instanceof Error ? error.message : "Unable to update QA applicability.";
};

export function QaApplicabilityControl({
  qa,
  isCompleted,
  onChange,
}: QaApplicabilityControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const restoring = qa?.isApplicable === false;
  const trimmedReason = reason.trim();
  const reasonIsValid = trimmedReason.length >= 1 && trimmedReason.length <= 512;

  if (!isCompleted) {
    return null;
  }

  const openDialog = () => {
    setError("");
    setReason("");
    setIsOpen(true);
  };

  const closeDialog = () => {
    if (!submittingRef.current) {
      setIsOpen(false);
      setError("");
    }
  };

  const submit = async () => {
    if (submittingRef.current || (!restoring && !reasonIsValid)) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setError("");
    try {
      await onChange(restoring, restoring ? undefined : trimmedReason);
      setIsOpen(false);
      setReason("");
    } catch (submitError) {
      const message = getErrorMessage(submitError);
      if (message) {
        setError(message);
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="secondary-button small-button"
        onClick={openDialog}
      >
        {restoring ? "Mark as applicable for QA" : "Mark as not applicable for QA"}
      </button>

      {isOpen ? (
        <div className="modal-backdrop qa-applicability-backdrop" onClick={closeDialog}>
          <section
            className="modal-card qa-applicability-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qa-applicability-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <h2 id="qa-applicability-title">
                {restoring ? "Restore QA applicability?" : "Exclude this call from QA?"}
              </h2>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={closeDialog}
                disabled={isSubmitting}
              >
                ×
              </button>
            </div>

            {restoring ? (
              <>
                <p>
                  The QA status will become pending. The previous score will not be restored.
                </p>
                <p>QA recalculation is required to generate a new score.</p>
              </>
            ) : (
              <label className="full-width">
                Reason
                <textarea
                  aria-label="Reason"
                  rows={4}
                  maxLength={512}
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setError("");
                  }}
                  placeholder="Why should this call be excluded from QA?"
                  autoFocus
                />
                <small className="field-hint">{reason.length}/512 characters</small>
              </label>
            )}

            {error ? <p className="error-text" role="alert">{error}</p> : null}

            <div className="modal-actions full-width">
              <button
                type="button"
                className="secondary-button"
                onClick={closeDialog}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void submit()}
                disabled={isSubmitting || (!restoring && !reasonIsValid)}
              >
                {isSubmitting
                  ? "Updating..."
                  : restoring
                    ? "Mark as applicable"
                    : "Mark as not applicable"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
