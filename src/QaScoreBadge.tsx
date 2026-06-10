import { formatQaNotApplicableReason, isQaNotApplicable } from "./qaDisplay";

type QaScoreBadgeProps = {
  score?: number | null;
  isApplicable?: boolean | null;
  status?: string | null;
  notApplicableReason?: string | null;
  earnedPoints?: number | null;
  possiblePoints?: number | null;
  compact?: boolean;
};

const getQaScoreTone = (score?: number | null) => {
  if (score == null) return "muted";
  if (score >= 85) return "good";
  if (score >= 65) return "medium";
  return "low";
};

export function QaScoreBadge({
  score,
  isApplicable,
  status,
  notApplicableReason,
  earnedPoints,
  possiblePoints,
  compact = false,
}: QaScoreBadgeProps) {
  if (isQaNotApplicable({ isApplicable, status })) {
    const reason = formatQaNotApplicableReason(notApplicableReason);

    return (
      <span
        className={`qa-badge qa-badge-muted qa-badge-not-applicable ${compact ? "qa-badge-compact" : ""}`}
        title={reason ? `Reason: ${reason}` : "QA not applicable"}
      >
        <strong>{compact ? "Not applicable" : "QA not applicable"}</strong>
        {reason && !compact ? <small>{reason}</small> : null}
      </span>
    );
  }

  if (score == null) {
    return <span className="qa-badge qa-badge-muted">Not scored</span>;
  }

  const tone = getQaScoreTone(score);

  return (
    <span className={`qa-badge qa-badge-${tone} ${compact ? "qa-badge-compact" : ""}`}>
      <strong>{score.toFixed(2)}%</strong>
      {earnedPoints != null && possiblePoints != null ? (
        <small>
          {earnedPoints}/{possiblePoints}
        </small>
      ) : null}
    </span>
  );
}
