type QaApplicabilityFields = {
  status?: string | null;
  isApplicable?: boolean | null;
};

export const isQaNotApplicable = (qa?: QaApplicabilityFields | null) =>
  qa?.isApplicable === false || qa?.status?.trim().toLowerCase() === "not_applicable";

export const formatQaNotApplicableReason = (reason?: string | null) => {
  const trimmed = reason?.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
};
