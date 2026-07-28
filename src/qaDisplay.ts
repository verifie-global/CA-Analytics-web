import type { QaQuestionResult, QaScoringMode } from "./types";

export const DEFAULT_QA_SCORE_MAXIMUM = 100;
export const DEFAULT_QA_SCORING_MODE: QaScoringMode = "weighted_ratio";

type QaApplicabilityFields = {
  status?: string | null;
  isApplicable?: boolean | null;
};

export const isQaNotApplicable = (qa?: QaApplicabilityFields | null) =>
  qa?.isApplicable === false || qa?.status?.trim().toLowerCase() === "not_applicable";

export const formatQaNotApplicableReason = (reason?: string | null) => {
  const trimmed = reason?.trim();
  return trimmed || "";
};

export const formatQaScoreNumber = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatQaScore = (
  score?: number | null,
  maximum = DEFAULT_QA_SCORE_MAXIMUM,
) =>
  score == null || !Number.isFinite(score)
    ? "-"
    : `${formatQaScoreNumber(score)} / ${formatQaScoreNumber(maximum)}`;

export const calculateQaScore = (
  questions: QaQuestionResult[],
  drafts: Record<string, { score: 0 | 1 }>,
  maximum: number,
  mode: QaScoringMode,
) => {
  const possiblePoints = questions.reduce((sum, question) => sum + question.weight, 0);
  const earnedPoints = questions.reduce(
    (sum, question) => sum + question.weight * (drafts[question.id]?.score ?? question.score),
    0,
  );
  const failedWeight = questions.reduce(
    (sum, question) =>
      sum + ((drafts[question.id]?.score ?? question.score) > 0 ? 0 : question.weight),
    0,
  );

  return {
    earnedPoints,
    possiblePoints,
    score:
      mode === "subtract_failed_weights"
        ? maximum - failedWeight
        : possiblePoints > 0
          ? (earnedPoints / possiblePoints) * maximum
          : 0,
  };
};
