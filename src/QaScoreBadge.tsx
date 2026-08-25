import {
  DEFAULT_QA_SCORE_MAXIMUM,
  formatQaNotApplicableReason,
  formatQaScore,
  isQaNotApplicable,
} from "./qaDisplay";
import { useI18n } from "./i18n";

type QaScoreBadgeProps = {
  score?: number | null;
  isApplicable?: boolean | null;
  status?: string | null;
  notApplicableReason?: string | null;
  maximumScore?: number;
  compact?: boolean;
};

const getQaScoreTone = (
  score?: number | null,
  maximumScore = DEFAULT_QA_SCORE_MAXIMUM,
) => {
  if (score == null) return "muted";
  const ratio = maximumScore > 0 ? score / maximumScore : 0;
  if (ratio >= 0.85) return "good";
  if (ratio >= 0.65) return "medium";
  return "low";
};

export function QaScoreBadge({
  score,
  isApplicable,
  status,
  notApplicableReason,
  maximumScore = DEFAULT_QA_SCORE_MAXIMUM,
  compact = false,
}: QaScoreBadgeProps) {
  const { t } = useI18n();
  if (isQaNotApplicable({ isApplicable, status })) {
    const reason = formatQaNotApplicableReason(notApplicableReason);

    return (
      <span
        className={`qa-badge qa-badge-muted qa-badge-not-applicable ${compact ? "qa-badge-compact" : ""}`}
        title={reason ? t("Reason: {{reason}}", { reason }) : t("QA not applicable")}
      >
        <strong>{compact ? "Not applicable" : "QA not applicable"}</strong>
        {reason && !compact ? <small data-i18n-skip>{reason}</small> : null}
      </span>
    );
  }

  if (status?.trim().toLowerCase() === "pending") {
    return (
      <span className={`qa-badge qa-badge-muted ${compact ? "qa-badge-compact" : ""}`}>
        <strong>Pending QA recalculation</strong>
      </span>
    );
  }

  if (score == null) {
    return <span className="qa-badge qa-badge-muted">Not scored</span>;
  }

  const tone = getQaScoreTone(score, maximumScore);

  return (
    <span className={`qa-badge qa-badge-${tone} ${compact ? "qa-badge-compact" : ""}`}>
      <strong>{formatQaScore(score, maximumScore)}</strong>
    </span>
  );
}
