type QaScoreBadgeProps = {
  score?: number | null;
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
  earnedPoints,
  possiblePoints,
  compact = false,
}: QaScoreBadgeProps) {
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
