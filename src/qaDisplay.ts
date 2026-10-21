import type { QaQuestionResult, QaScoringMode, QaSectionDefinition } from "./types";
import { getIntlLocale } from "./i18n";

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

  return new Intl.NumberFormat(getIntlLocale(), {
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
  drafts: Record<string, { score: 0 | 1; isApplicable?: boolean }>,
  maximum: number,
  mode: QaScoringMode,
  sections: QaSectionDefinition[] = [],
) => {
  if (mode === "section_weighted_ratio") {
    const possiblePoints = sections.reduce((sum, section) => sum + section.weight, 0);
    let earnedPoints = 0;
    const sectionIds = new Set(sections.map((section) => section.id.toLowerCase()));
    let isComplete = sections.length > 0 && maximum > 0 &&
      sectionIds.size === sections.length &&
      sections.every((section) => section.id.trim() && section.weight > 0) &&
      questions.every((question) => question.sectionId && sectionIds.has(question.sectionId.toLowerCase()));

    for (const section of sections) {
      const applicableQuestions = questions.filter((question) =>
        question.sectionId?.toLowerCase() === section.id.toLowerCase() &&
        (drafts[question.id]?.isApplicable ?? question.isApplicable ?? true),
      );
      const applicableWeight = applicableQuestions.reduce((sum, question) => sum + question.weight, 0);
      const earnedWeight = applicableQuestions.reduce(
        (sum, question) => sum + question.weight * (drafts[question.id]?.score ?? question.score),
        0,
      );
      if (applicableWeight > 0) {
        earnedPoints += section.weight * earnedWeight / applicableWeight;
      } else {
        isComplete = false;
      }
    }

    const score = earnedPoints / possiblePoints * maximum;
    return {
      earnedPoints,
      possiblePoints,
      // Keep the original section weights when a section has no applicable answers.
      // The backend leaves such evaluations unscored until every section is complete.
      score: isComplete && possiblePoints > 0
        ? Math.round((score + Math.abs(score) * Number.EPSILON) * 100) / 100
        : null,
    };
  }

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
