import type {
  AppSettings,
  AskEvidence,
  AskResponse,
  AuthTokenResponse,
  CallDetail,
  CallFilterOption,
  CallFilterOptions,
  CallFilters,
  CallsListResult,
  CallScoreSummary,
  CallSummary,
  CallSummaryReport,
  DiarizationSegment,
  EmotionInfo,
  PartyInfo,
  QaEvaluation,
  QaProfile,
  QaProfileDefinition,
  QaQuestionDefinition,
  QaQuestionCorrection,
  QaQuestionResult,
  QaResult,
  QaScoringSettings,
  ScoreMetricSummary,
  SpeakerSegment,
  WorkflowDelivery,
  WorkflowDestination,
  WorkflowDestinationFilters,
  WorkflowDestinationInput,
  WorkflowDestinationPayloadOptions,
  WorkflowPlatform,
  WorkflowTestResult,
  CompanyAgent,
  CompanyUser,
  CompanyUserInput,
} from "./types";

type RequestError = Error & {
  status?: number;
};

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const buildUrl = (settings: AppSettings, path: string, query?: URLSearchParams) => {
  const url = `${trimSlash(settings.baseUrl)}${path}`;
  return query ? `${url}?${query.toString()}` : url;
};

const authHeaders = (settings: AppSettings, extra?: HeadersInit) => ({
  Authorization: `Bearer ${settings.accessToken}`,
  ...extra,
});

const jsonHeaders = (extra?: HeadersInit) => ({
  "Content-Type": "application/json",
  ...extra,
});

const createRequestError = (message: string, status: number): RequestError => {
  const error = new Error(message) as RequestError;
  error.status = status;
  return error;
};

async function request<T>(
  settings: AppSettings,
  path: string,
  init?: RequestInit,
  query?: URLSearchParams,
): Promise<T> {
  const response = await fetch(buildUrl(settings, path, query), {
    ...init,
    headers: authHeaders(settings, init?.headers),
  });

  if (!response.ok) {
    const text = await response.text();
    throw createRequestError(text || `Request failed with status ${response.status}`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchCallSummaryReport(
  settings: AppSettings,
  createdFromUtc: string,
  createdToUtc: string,
) {
  const query = new URLSearchParams({
    createdFromUtc,
    createdToUtc,
  });

  return request<CallSummaryReport>(
    settings,
    `/api/companies/${settings.companyId}/reports/call-summary`,
    undefined,
    query,
  );
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asOptionalRecord = (value: unknown): Record<string, unknown> | null => {
  const record = asRecord(value);
  return Object.keys(record).length > 0 ? record : null;
};

const firstOptionalRecord = (...values: unknown[]) => {
  for (const value of values) {
    const record = asOptionalRecord(value);
    if (record) {
      return record;
    }
  }

  return null;
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const readString = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
};

const readStringLike = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
};

const readNumber = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number") {
      return value;
    }
  }

  return undefined;
};

const readNullableNumber = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }

    const value = record[key];
    if (value === null) {
      return null;
    }

    if (typeof value === "number") {
      return value;
    }
  }

  return undefined;
};

const readBoolean = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
};

const normalizeScores = (value: unknown) =>
  Object.entries(asRecord(value)).reduce<Record<string, number>>(
    (result, [scoreLabel, score]) => {
      if (typeof score === "number" && Number.isFinite(score)) {
        result[scoreLabel] = score;
      }
      return result;
    },
    {},
  );

export const getEmotion = (segment: DiarizationSegment): EmotionInfo => {
  const emotion = segment.emotion ?? {};
  const scores = emotion.scores ?? segment.emotionScores;
  const rawScores = emotion.rawScores ?? segment.emotionRawScores;

  return {
    label: emotion.label ?? segment.emotionLabel ?? "unknown",
    rawLabel: emotion.rawLabel ?? segment.emotionRawLabel ?? "unknown",
    confidence: emotion.confidence ?? segment.emotionConfidence ?? 0,
    scores: normalizeScores(scores),
    rawScores: normalizeScores(rawScores),
    model: emotion.model ?? segment.emotionModel ?? "",
  };
};

const toSegments = (value: unknown): SpeakerSegment[] =>
  asArray(value)
    .map((item) => asRecord(item))
    .map((segment) => {
      const diarizationSegment = segment as unknown as DiarizationSegment;
      const speaker =
        readString(segment, "speaker", "speakerName", "speakerLabel") ?? "Speaker";
      const normalizedSpeaker = speaker.toUpperCase();
      const role: "AGENT" | "CUSTOMER" | "UNKNOWN" =
        normalizedSpeaker === "AGENT" || normalizedSpeaker === "CUSTOMER"
          ? (normalizedSpeaker as "AGENT" | "CUSTOMER")
          : "UNKNOWN";
      const startSeconds = readNumber(segment, "start");
      const endSeconds = readNumber(segment, "end");
      const startMs =
        readNumber(segment, "startMs", "offsetMs") ??
        (startSeconds == null ? undefined : startSeconds * 1000);
      const endMs =
        readNumber(segment, "endMs") ??
        (endSeconds == null ? undefined : endSeconds * 1000);

      return {
        speaker,
        role,
        startMs,
        endMs,
        text: readString(segment, "text", "transcript") ?? "",
        emotion: getEmotion(diarizationSegment),
      };
    })
    .filter((segment) => segment.text);

const normalizePartyInfo = (value: unknown, fallback?: Partial<PartyInfo>): PartyInfo | null => {
  const record = asRecord(value);
  const name = readString(record, "name") ?? fallback?.name ?? null;
  const externalId = readString(record, "externalId") ?? fallback?.externalId ?? null;
  const phone = readString(record, "phone") ?? fallback?.phone ?? null;

  if (!name && !externalId && !phone) {
    return null;
  }

  return {
    name,
    externalId,
    phone,
  };
};

const normalizeScoreMetricSummary = (value: unknown): ScoreMetricSummary | null => {
  const record = asRecord(value);
  const cumulative = readNumber(record, "cumulative");
  const average = readNumber(record, "average");
  const scoredCount = readNumber(record, "scoredCount");
  const missingCount = readNumber(record, "missingCount");
  const notApplicableCount = readNumber(record, "notApplicableCount");

  if (
    cumulative == null &&
    average == null &&
    scoredCount == null &&
    missingCount == null &&
    notApplicableCount == null
  ) {
    return null;
  }

  return {
    cumulative: cumulative ?? null,
    average: average ?? null,
    scoredCount: scoredCount ?? null,
    missingCount: missingCount ?? null,
    notApplicableCount: notApplicableCount ?? null,
  };
};

const normalizeCallScoreSummary = (value: unknown): CallScoreSummary | null => {
  const record = asRecord(value);
  const customerSatisfactionScore = normalizeScoreMetricSummary(record.customerSatisfactionScore);
  const agentFriendlinessScore = normalizeScoreMetricSummary(record.agentFriendlinessScore);
  const qaScore = normalizeScoreMetricSummary(record.qaScore);
  const callCount = readNumber(record, "callCount");

  if (
    callCount == null &&
    !customerSatisfactionScore &&
    !agentFriendlinessScore &&
    !qaScore
  ) {
    return null;
  }

  return {
    callCount: callCount ?? null,
    customerSatisfactionScore,
    agentFriendlinessScore,
    qaScore,
  };
};

const normalizeCallFilterOption = (
  item: unknown,
  partyPrefix: "agent" | "customer",
): CallFilterOption | null => {
  if (typeof item === "string") {
    const phone = item.trim();
    return phone ? { name: null, phone } : null;
  }

  if (typeof item === "number" && Number.isFinite(item)) {
    return { name: null, phone: String(item) };
  }

  const record = asRecord(item);
  const phone =
    readStringLike(record, "phone", "phoneNumber", `${partyPrefix}Phone`, "number") ?? "";
  const name =
    readString(record, "name", "displayName", "fullName", `${partyPrefix}Name`) ?? null;

  return phone.trim()
    ? {
        name,
        phone: phone.trim(),
      }
    : null;
};

const normalizeCallFilterOptionList = (
  value: unknown,
  partyPrefix: "agent" | "customer",
) => {
  const optionsByPhone = new Map<string, CallFilterOption>();

  asArray(value)
    .map((item) => normalizeCallFilterOption(item, partyPrefix))
    .forEach((option) => {
      if (!option) {
        return;
      }

      const existing = optionsByPhone.get(option.phone);
      optionsByPhone.set(option.phone, {
        phone: option.phone,
        name: existing?.name ?? option.name ?? null,
      });
    });

  return [...optionsByPhone.values()].sort((first, second) => {
    const firstLabel = first.name ? `${first.name} ${first.phone}` : first.phone;
    const secondLabel = second.name ? `${second.name} ${second.phone}` : second.phone;
    return firstLabel.localeCompare(secondLabel, undefined, { sensitivity: "base" });
  });
};

const normalizeCallFilterOptions = (payload: unknown): CallFilterOptions => {
  const record = asRecord(payload);

  return {
    agents: normalizeCallFilterOptionList(
      record.agents ?? record.agentPhones ?? record.agentOptions ?? record.agentPhoneOptions,
      "agent",
    ),
    customers: normalizeCallFilterOptionList(
      record.customers ??
        record.customerPhones ??
        record.customerOptions ??
        record.customerPhoneOptions,
      "customer",
    ),
  };
};

const normalizeCallSummary = (item: unknown): CallSummary => {
  const record = asRecord(item);
  const rawAnalysis = asRecord(record.analysis);
  const qa = asRecord(record.qa);
  const qaStatus = readString(record, "qaStatus") ?? readString(qa, "status") ?? null;
  const qaIsApplicable =
    readBoolean(record, "qaIsApplicable") ??
    readBoolean(qa, "isApplicable") ??
    (qaStatus?.toLowerCase() === "not_applicable" ? false : null);

  return {
    conversationId: readString(record, "conversationId", "id") ?? "unknown",
    status: readString(record, "status") ?? "Unknown",
    agentInfo: normalizePartyInfo(record.agentInfo ?? record.agent, {
      name: readString(record, "agentName"),
      externalId: readString(record, "agentExternalId"),
      phone: readString(record, "agentPhone"),
    }),
    customerInfo: normalizePartyInfo(record.customerInfo ?? record.customer, {
      name: readString(record, "customerName"),
      externalId: readString(record, "customerExternalId"),
      phone: readString(record, "customerPhone"),
    }),
    sentiment: readString(record, "sentiment") ?? readString(rawAnalysis, "sentiment"),
    satisfactionScore:
      readNumber(record, "satisfactionScore") ?? readNumber(rawAnalysis, "satisfactionScore"),
    friendlinessScore: readNumber(record, "friendlinessScore"),
    qaScore: readNumber(record, "qaScore") ?? readNumber(qa, "score"),
    qaIsApplicable,
    qaStatus,
    qaNotApplicableReason:
      readString(record, "qaNotApplicableReason") ??
      readString(qa, "notApplicableReason") ??
      null,
    qaEarnedPoints: readNumber(record, "qaEarnedPoints") ?? readNumber(qa, "earnedPoints"),
    qaPossiblePoints: readNumber(record, "qaPossiblePoints") ?? readNumber(qa, "possiblePoints"),
    durationSeconds: readNumber(record, "durationSeconds", "callDurationSeconds"),
    language: readString(record, "language"),
    createdUtc: readString(record, "createdUtc", "createdAtUtc", "createdAt"),
    completedUtc: readString(record, "completedUtc", "completedAtUtc", "completedAt"),
    hasError: readBoolean(record, "hasError") ?? Boolean(readString(record, "error")),
    error: readString(record, "error"),
    raw: item,
  };
};

const normalizeCallDetail = (item: unknown): CallDetail => {
  const record = asRecord(item);
  const rawAnalysis = asRecord(record.analysis ?? record.rawAnalysis);
  const demoCall = firstOptionalRecord(record.demoCall, rawAnalysis.demoCall);
  const entities = asRecord(record.entities ?? rawAnalysis.entities);
  const qa = normalizeQaResult(record.qa);
  const segments = toSegments(
    rawAnalysis.pseudoDiarization ??
      record.diarization ??
      record.segments ??
      record.diarizationSegments ??
      rawAnalysis.diarization ??
      rawAnalysis.segments,
  );

  return {
    conversationId: readString(record, "conversationId", "id") ?? "unknown",
    status: readString(record, "status") ?? "Unknown",
    companyId: readNumber(record, "companyId") ?? null,
    agentInfo: normalizePartyInfo(record.agentInfo),
    customerInfo: normalizePartyInfo(record.customerInfo),
    isInbound: readBoolean(record, "isInbound") ?? null,
    transcript:
      readString(record, "transcript") ??
      readString(rawAnalysis, "summary", "rawTranscript") ??
      segments.map((segment) => segment.text).join("\n"),
    redactedTranscript: readString(record, "redactedTranscript"),
    summary: readString(rawAnalysis, "summary"),
    sentiment: readString(record, "sentiment") ?? readString(rawAnalysis, "sentiment"),
    satisfactionScore:
      readNumber(record, "satisfactionScore") ?? readNumber(rawAnalysis, "satisfactionScore"),
    friendlinessScore: readNumber(record, "friendlinessScore"),
    durationSeconds: readNumber(record, "durationSeconds", "callDurationSeconds"),
    language: readString(record, "language"),
    createdUtc: readString(record, "createdUtc", "createdAtUtc", "createdAt"),
    completedUtc: readString(record, "completedUtc", "completedAtUtc", "completedAt"),
    error: readString(record, "error"),
    qa,
    segments,
    entities,
    analysis: rawAnalysis,
    demoCall,
    videoStats: firstOptionalRecord(
      record.videoStats,
      rawAnalysis.videoStats,
      demoCall?.videoStats,
    ),
    videoAnalysis: firstOptionalRecord(
      record.videoAnalysis,
      rawAnalysis.videoAnalysis,
      demoCall?.videoAnalysis,
    ),
    roleMapping: firstOptionalRecord(
      record.roleMapping,
      rawAnalysis.roleMapping,
      demoCall?.roleMapping,
    ),
    agentTipsHistory:
      Array.isArray(record.agentTipsHistory)
        ? record.agentTipsHistory
        : Array.isArray(rawAnalysis.agentTipsHistory)
          ? rawAnalysis.agentTipsHistory
          : null,
    raw: record,
  };
};

const normalizeQaQuestionDefinition = (item: unknown): QaQuestionDefinition => {
  const record = asRecord(item);
  return {
    id: readString(record, "id") ?? "",
    title: readString(record, "title") ?? "",
    description: readString(record, "description") ?? "",
    weight: readNumber(record, "weight") ?? 0,
    isEnabled: readBoolean(record, "isEnabled") ?? true,
  };
};

const normalizeQaProfileDefinition = (value: unknown): QaProfileDefinition => {
  const record = asRecord(value);
  return {
    businessContext: readString(record, "businessContext") ?? "",
    mainGoalOfCallEvaluation: readString(record, "mainGoalOfCallEvaluation") ?? "",
    businessPriorities: asArray(record.businessPriorities).map((item) => String(item)).filter(Boolean),
    targetBusinessOutcome: readString(record, "targetBusinessOutcome") ?? "",
    sentimentRules: readString(record, "sentimentRules") ?? "",
    satisfactionRules: readString(record, "satisfactionRules") ?? "",
    friendlinessRules: readString(record, "friendlinessRules") ?? "",
    resolutionRules: readString(record, "resolutionRules") ?? "",
    urgencyRules: readString(record, "urgencyRules") ?? "",
    departmentRules: readString(record, "departmentRules") ?? "",
    complianceRules: readString(record, "complianceRules") ?? "",
    additionalInstructions: readString(record, "additionalInstructions") ?? "",
    questions: asArray(record.questions).map(normalizeQaQuestionDefinition),
  };
};

const normalizeQaQuestionResult = (item: unknown): QaQuestionResult => {
  const record = asRecord(item);
  const correction = asRecord(record.manualCorrection);
  const originalScore =
    readNumber(record, "originalScore", "originalAutomaticScore", "automaticScore") ??
    readNumber(correction, "originalScore", "score") ??
    null;
  return {
    id: readString(record, "id") ?? "",
    title: readString(record, "title") ?? "",
    description: readString(record, "description") ?? "",
    weight: readNumber(record, "weight") ?? 0,
    score: readNumber(record, "score") ?? 0,
    reason: readString(record, "reason") ?? "",
    isManuallyCorrected:
      readBoolean(
        record,
        "isManuallyCorrected",
        "manuallyCorrected",
        "wasManuallyCorrected",
        "isCorrected",
      ) ??
      Object.keys(correction).length > 0,
    originalScore,
  };
};

const normalizeQaEvaluation = (value: unknown): QaEvaluation | null => {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) {
    return null;
  }

  return {
    profileName: readString(record, "profileName") ?? null,
    overallComment: readString(record, "overallComment") ?? null,
    strengths: asArray(record.strengths).map((item) => String(item)).filter(Boolean),
    improvements: asArray(record.improvements).map((item) => String(item)).filter(Boolean),
    resolutionStatus: readString(record, "resolutionStatus") ?? null,
    questionResults: asArray(record.questionResults).map(normalizeQaQuestionResult),
    generatedAtUtc: readString(record, "generatedAtUtc") ?? null,
  };
};

const normalizeQaResult = (value: unknown): QaResult | null => {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) {
    return null;
  }

  const manualCorrectionRecord = asRecord(record.manualCorrection);
  return {
    status: readString(record, "status") ?? null,
    isApplicable:
      readBoolean(record, "isApplicable") ??
      (readString(record, "status")?.toLowerCase() === "not_applicable" ? false : null),
    score: readNumber(record, "score", "qaScore") ?? null,
    earnedPoints: readNumber(record, "earnedPoints") ?? null,
    possiblePoints: readNumber(record, "possiblePoints") ?? null,
    notApplicableReason: readString(record, "notApplicableReason") ?? null,
    evaluation: normalizeQaEvaluation(record.evaluation),
    manualCorrection: Object.keys(manualCorrectionRecord).length
      ? {
          originalScore: readNumber(manualCorrectionRecord, "originalScore") ?? null,
          reason: readString(manualCorrectionRecord, "reason") ?? null,
          correctedAt: readString(manualCorrectionRecord, "correctedAt") ?? null,
          correctedByUserId: readNumber(manualCorrectionRecord, "correctedByUserId") ?? null,
          correctedBy: readString(manualCorrectionRecord, "correctedBy") ?? null,
        }
      : null,
  };
};

const normalizeQaScoringSettings = (
  value: unknown,
  fallbackCompanyId: string,
  fallbackQaScoreMaximum = 100,
  fallbackDuration: number | null = null,
  fallbackRepeatContactAutoPassEnabled = false,
): QaScoringSettings => {
  const record = asRecord(value);
  const minScorableCallDurationSeconds = readNullableNumber(
    record,
    "minScorableCallDurationSeconds",
  );

  return {
    companyId: readNumber(record, "companyId") ?? Number(fallbackCompanyId),
    isConfigured: readBoolean(record, "isConfigured") ?? false,
    isEnabled: readBoolean(record, "isEnabled") ?? false,
    qaScoreMaximum: readNumber(record, "qaScoreMaximum") ?? fallbackQaScoreMaximum,
    minScorableCallDurationSeconds:
      minScorableCallDurationSeconds === undefined
        ? fallbackDuration
        : minScorableCallDurationSeconds,
    repeatContactAutoPassEnabled:
      readBoolean(record, "repeatContactAutoPassEnabled") ??
      fallbackRepeatContactAutoPassEnabled,
    updatedAt: readString(record, "updatedAt", "updatedAtUtc") ?? null,
  };
};

const normalizeRecalculatedQaResult = (value: unknown): QaResult | null => {
  const record = asRecord(value);
  const qa = normalizeQaResult(record.qa);

  if (qa) {
    return qa;
  }

  return normalizeQaResult(value);
};

const normalizeStringRecord = (value: unknown): Record<string, string> =>
  Object.entries(asRecord(value)).reduce<Record<string, string>>((result, [key, item]) => {
    const normalizedKey = key.trim();
    if (!normalizedKey || item == null) {
      return result;
    }

    result[normalizedKey] = typeof item === "string" ? item : String(item);
    return result;
  }, {});

const normalizeStringList = (value: unknown) =>
  asArray(value)
    .map((item) => (typeof item === "string" ? item : String(item ?? "")))
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeWorkflowFilters = (value: unknown): WorkflowDestinationFilters => {
  const record = asRecord(value);
  return {
    sentiments: normalizeStringList(record.sentiments),
    taskUrgencies: normalizeStringList(record.taskUrgencies),
    departments: normalizeStringList(record.departments),
    minSatisfactionScore: readNullableNumber(record, "minSatisfactionScore") ?? null,
    maxSatisfactionScore: readNullableNumber(record, "maxSatisfactionScore") ?? null,
    minFriendlinessScore: readNullableNumber(record, "minFriendlinessScore") ?? null,
    maxFriendlinessScore: readNullableNumber(record, "maxFriendlinessScore") ?? null,
    minQaScore: readNullableNumber(record, "minQaScore") ?? null,
    maxQaScore: readNullableNumber(record, "maxQaScore") ?? null,
    qaApplicable: readBoolean(record, "qaApplicable") ?? null,
    isInbound: readBoolean(record, "isInbound") ?? null,
  };
};

const normalizeWorkflowPayloadOptions = (value: unknown): WorkflowDestinationPayloadOptions => {
  const record = asRecord(value);
  const jiraRecord = asOptionalRecord(record.jiraIssue);
  const bitrixRecord = asOptionalRecord(record.bitrix24Lead);
  return {
    includeTranscript: readBoolean(record, "includeTranscript") ?? false,
    includeRedactedTranscript: readBoolean(record, "includeRedactedTranscript") ?? true,
    includeAnalysisJson: readBoolean(record, "includeAnalysisJson") ?? true,
    includeDiarization: readBoolean(record, "includeDiarization") ?? true,
    includeQaEvaluationJson: readBoolean(record, "includeQaEvaluationJson") ?? true,
    customFields: normalizeStringRecord(record.customFields),
    ...(jiraRecord
      ? {
          jiraIssue: {
            projectKey: readString(jiraRecord, "projectKey") ?? "",
            issueType: readString(jiraRecord, "issueType") ?? "Task",
            summary: readString(jiraRecord, "summary") ?? null,
            priorityName: readString(jiraRecord, "priorityName") ?? null,
            assigneeAccountId: readString(jiraRecord, "assigneeAccountId") ?? null,
            labels: normalizeStringList(jiraRecord.labels),
            includeAnalysisSummaryInDescription:
              readBoolean(jiraRecord, "includeAnalysisSummaryInDescription") ?? true,
            includeTranscriptInDescription:
              readBoolean(jiraRecord, "includeTranscriptInDescription") ?? false,
            additionalFields: normalizeStringRecord(jiraRecord.additionalFields),
          },
        }
      : {}),
    ...(bitrixRecord
      ? {
          bitrix24Lead: {
            title: readString(bitrixRecord, "title") ?? null,
            sourceId: readString(bitrixRecord, "sourceId") ?? null,
            statusId: readString(bitrixRecord, "statusId") ?? null,
            assignedById: readNullableNumber(bitrixRecord, "assignedById") ?? null,
            opened: readBoolean(bitrixRecord, "opened") ?? null,
            includeAnalysisSummaryInComments:
              readBoolean(bitrixRecord, "includeAnalysisSummaryInComments") ?? true,
            additionalFields: normalizeStringRecord(bitrixRecord.additionalFields),
          },
        }
      : {}),
  };
};

const normalizeWorkflowPlatform = (value: unknown): WorkflowPlatform => {
  const platform = typeof value === "string" ? value.trim() : "";
  const knownPlatforms: WorkflowPlatform[] = [
    "Zapier",
    "Make",
    "n8n",
    "Pipedream",
    "Power Automate",
    "Custom Webhook",
    "jira",
    "bitrix24",
  ];
  return knownPlatforms.find((item) => item.toLowerCase() === platform.toLowerCase()) ?? "Custom Webhook";
};

const normalizeWorkflowDestination = (value: unknown): WorkflowDestination => {
  const record = asRecord(value);
  return {
    id: readStringLike(record, "id", "destinationId", "workflowDestinationId") ?? "",
    name: readString(record, "name") ?? "",
    platform: normalizeWorkflowPlatform(record.platform),
    eventType: readString(record, "eventType") ?? "analysis.completed",
    isEnabled: readBoolean(record, "isEnabled", "enabled") ?? true,
    webhookUrl: readString(record, "webhookUrl", "url") ?? "",
    headers: normalizeStringRecord(record.headers),
    filters: normalizeWorkflowFilters(record.filters),
    payloadOptions: normalizeWorkflowPayloadOptions(record.payloadOptions),
    metadata: normalizeStringRecord(record.metadata),
    createdAt: readString(record, "createdAt", "createdAtUtc") ?? null,
    updatedAt: readString(record, "updatedAt", "updatedAtUtc") ?? null,
    raw: value,
  };
};

const normalizeWorkflowDelivery = (value: unknown): WorkflowDelivery => {
  const record = asRecord(value);
  const responseBody = record.responseBody;
  return {
    id: readStringLike(record, "id", "deliveryId") ?? "",
    createdAt: readString(record, "createdAt", "createdAtUtc") ?? null,
    deliveredAt: readString(record, "deliveredAt", "deliveredAtUtc") ?? null,
    status: readString(record, "status") ?? "unknown",
    attemptCount: readNumber(record, "attemptCount", "attempts") ?? null,
    responseStatusCode: readNumber(record, "responseStatusCode", "statusCode") ?? null,
    error: readString(record, "error", "errorMessage") ?? null,
    responseBody:
      typeof responseBody === "string"
        ? responseBody
        : responseBody == null
          ? null
          : JSON.stringify(responseBody),
    raw: value,
  };
};

const listFromResponse = (payload: unknown) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = asRecord(payload);
  const candidate =
    record.items ??
    record.results ??
    record.calls ??
    record.data ??
    record.value;

  return asArray(candidate);
};

const normalizeCallsListResponse = (
  payload: unknown,
  filters: CallFilters,
): CallsListResult => {
  const items = listFromResponse(payload).map(normalizeCallSummary);

  if (Array.isArray(payload)) {
    return {
      companyId: null,
      page: filters.page,
      pageSize: filters.pageSize,
      total: items.length,
      scoreSummary: null,
      items,
    };
  }

  const record = asRecord(payload);

  return {
    companyId: readNumber(record, "companyId") ?? null,
    page: readNumber(record, "page", "Page") ?? filters.page,
    pageSize: readNumber(record, "pageSize", "PageSize") ?? filters.pageSize,
    total: readNumber(record, "total", "totalCount", "count") ?? items.length,
    scoreSummary: normalizeCallScoreSummary(record.scoreSummary),
    items,
  };
};

const normalizeAskEvidence = (value: unknown): AskEvidence => {
  const record = asRecord(value);

  return {
    conversationId: readStringLike(record, "conversationId", "callId", "id") ?? null,
    source: readString(record, "source") ?? null,
    snippet: readString(record, "snippet", "text", "value") ?? null,
    timestampMs: readNumber(record, "timestampMs", "startMs", "offsetMs") ?? null,
    field: readString(record, "field") ?? null,
  };
};

const normalizeAskResponse = (payload: unknown): AskResponse => {
  const record = asRecord(payload);

  return {
    answer: readString(record, "answer") ?? "",
    evidence: asArray(record.evidence).map(normalizeAskEvidence),
    usedCalls: readNumber(record, "usedCalls") ?? null,
    scope: readString(record, "scope") ?? null,
    semanticSearchUsed: readBoolean(record, "semanticSearchUsed") ?? null,
  };
};

const normalizeQueryValues = (...values: Array<string | string[] | undefined>) => {
  const uniqueValues = new Set<string>();

  values.forEach((value) => {
    const nextValues = Array.isArray(value) ? value : [value];
    nextValues.forEach((nextValue) => {
      const trimmed = nextValue?.trim();
      if (trimmed) {
        uniqueValues.add(trimmed);
      }
    });
  });

  return [...uniqueValues];
};

const setMultiValueFilterParam = (
  query: URLSearchParams,
  pluralParam: string,
  pluralValues: string[] | undefined,
  singleParam: string,
  singleValue: string | undefined,
) => {
  const values = normalizeQueryValues(pluralValues);

  if (values.length > 0) {
    query.set(pluralParam, values.join(","));
    return;
  }

  const legacyValue = singleValue?.trim();
  if (legacyValue) {
    query.set(singleParam, legacyValue);
  }
};

const buildCallsFilterQuery = (filters: CallFilters, includePagination = true) => {
  const query = new URLSearchParams();

  if (includePagination) {
    query.set("Page", String(filters.page));
    query.set("PageSize", String(filters.pageSize));
  }

  if (filters.search) query.set("Search", filters.search);
  if (filters.conversationId) query.set("ConversationId", filters.conversationId);
  if (filters.createdFromUtc) query.set("createdFromUtc", filters.createdFromUtc);
  if (filters.createdToUtc) query.set("createdToUtc", filters.createdToUtc);
  if (filters.status) query.set("Status", filters.status);
  if (filters.sentiment) query.set("Sentiment", filters.sentiment);
  if (filters.minQaScore) query.set("minQaScore", filters.minQaScore);
  if (filters.maxQaScore) query.set("maxQaScore", filters.maxQaScore);
  setMultiValueFilterParam(query, "agentNames", filters.agentNames, "agentName", filters.agentName);
  setMultiValueFilterParam(
    query,
    "agentExternalIds",
    filters.agentExternalIds,
    "agentExternalId",
    filters.agentExternalId,
  );
  setMultiValueFilterParam(query, "agentPhones", filters.agentPhones, "agentPhone", filters.agentPhone);
  setMultiValueFilterParam(
    query,
    "customerNames",
    filters.customerNames,
    "customerName",
    filters.customerName,
  );
  setMultiValueFilterParam(
    query,
    "customerExternalIds",
    filters.customerExternalIds,
    "customerExternalId",
    filters.customerExternalId,
  );
  setMultiValueFilterParam(
    query,
    "customerPhones",
    filters.customerPhones,
    "customerPhone",
    filters.customerPhone,
  );

  return query;
};

const numberOrUndefined = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const setAskFilterValue = (
  target: Record<string, string | number | string[]>,
  key: string,
  value: string | string[] | undefined,
) => {
  if (Array.isArray(value)) {
    const values = normalizeQueryValues(value);
    if (values.length > 0) {
      target[key] = values;
    }
    return;
  }

  const trimmed = value?.trim();
  if (trimmed) {
    target[key] = trimmed;
  }
};

const buildAskFilters = (filters: CallFilters) => {
  const askFilters: Record<string, string | number | string[]> = {};

  setAskFilterValue(askFilters, "search", filters.search);
  setAskFilterValue(askFilters, "conversationId", filters.conversationId);
  setAskFilterValue(askFilters, "createdFromUtc", filters.createdFromUtc);
  setAskFilterValue(askFilters, "createdToUtc", filters.createdToUtc);
  setAskFilterValue(askFilters, "status", filters.status);
  setAskFilterValue(askFilters, "sentiment", filters.sentiment);
  setAskFilterValue(askFilters, "agentName", filters.agentName);
  setAskFilterValue(askFilters, "agentNames", filters.agentNames);
  setAskFilterValue(askFilters, "agentExternalId", filters.agentExternalId);
  setAskFilterValue(askFilters, "agentExternalIds", filters.agentExternalIds);
  setAskFilterValue(askFilters, "agentPhone", filters.agentPhone);
  setAskFilterValue(askFilters, "agentPhones", filters.agentPhones);
  setAskFilterValue(askFilters, "customerName", filters.customerName);
  setAskFilterValue(askFilters, "customerNames", filters.customerNames);
  setAskFilterValue(askFilters, "customerExternalId", filters.customerExternalId);
  setAskFilterValue(askFilters, "customerExternalIds", filters.customerExternalIds);
  setAskFilterValue(askFilters, "customerPhone", filters.customerPhone);
  setAskFilterValue(askFilters, "customerPhones", filters.customerPhones);

  const minQaScore = numberOrUndefined(filters.minQaScore);
  const maxQaScore = numberOrUndefined(filters.maxQaScore);
  if (minQaScore != null) askFilters.minQaScore = minQaScore;
  if (maxQaScore != null) askFilters.maxQaScore = maxQaScore;

  return askFilters;
};

export async function fetchCalls(settings: AppSettings, filters: CallFilters) {
  const query = buildCallsFilterQuery(filters);

  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/calls`,
    undefined,
    query,
  );

  return normalizeCallsListResponse(response, filters);
}

export async function askSingleCall(
  settings: AppSettings,
  conversationId: string,
  question: string,
) {
  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/calls/${conversationId}/ask`,
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ question }),
    },
  );

  return normalizeAskResponse(response);
}

export async function askCompanyCalls(
  settings: AppSettings,
  filters: CallFilters,
  payload: {
    question: string;
    maxCalls: number;
    useSemanticSearch: boolean;
    semanticMaxCalls: number;
  },
) {
  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/calls/ask`,
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        question: payload.question,
        maxCalls: payload.maxCalls,
        useSemanticSearch: payload.useSemanticSearch,
        semanticMaxCalls: payload.semanticMaxCalls,
        filters: buildAskFilters(filters),
      }),
    },
  );

  return normalizeAskResponse(response);
}

export async function fetchCallFilterOptions(settings: AppSettings) {
  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/calls/filter-options`,
  );

  return normalizeCallFilterOptions(response);
}

export async function exportCallsCsv(settings: AppSettings, filters: CallFilters) {
  const response = await fetch(
    buildUrl(
      settings,
      `/api/companies/${settings.companyId}/calls/export`,
      buildCallsFilterQuery(filters, false),
    ),
    {
      headers: authHeaders(settings),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw createRequestError(text || `Calls export failed with status ${response.status}`, response.status);
  }

  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileNameMatch =
    contentDisposition.match(/filename\*=UTF-8''([^;]+)/i) ??
    contentDisposition.match(/filename="?([^"]+)"?/i);
  const fileName = fileNameMatch?.[1]
    ? decodeURIComponent(fileNameMatch[1]).trim()
    : `calls-export-${settings.companyId}.csv`;

  return {
    blob: await response.blob(),
    fileName,
  };
}

export async function fetchCallDetail(settings: AppSettings, conversationId: string) {
  const detailRequest = request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/calls/${conversationId}`,
  );
  const demoSessionRequest = conversationId.startsWith("demo-")
    ? request<unknown>(
        settings,
        `/api/demo-call/sessions/${encodeURIComponent(conversationId)}`,
      ).catch((error: RequestError) => {
        if (error.status === 404) {
          return null;
        }

        throw error;
      })
    : Promise.resolve(null);
  const [response, demoSessionResponse] = await Promise.all([
    detailRequest,
    demoSessionRequest,
  ]);
  const detail = normalizeCallDetail(response);
  const demoSession = asOptionalRecord(demoSessionResponse);

  if (!demoSession) {
    return detail;
  }

  const summarizedVideoStats = firstOptionalRecord(demoSession.videoStats) ?? {
    framesAnalyzed: readNumber(demoSession, "videoFramesAnalyzed"),
    dominantEmotion: readString(demoSession, "dominantEmotion"),
    averageFaceScore: readNumber(demoSession, "averageFaceScore"),
    facePresenceRatio: readNumber(demoSession, "facePresenceRatio"),
  };

  return {
    ...detail,
    demoCall: demoSession,
    videoStats: firstOptionalRecord(summarizedVideoStats, detail.videoStats),
    roleMapping: firstOptionalRecord(demoSession.roleMapping, detail.roleMapping),
    agentTipsHistory: Array.isArray(demoSession.agentTipsHistory)
      ? demoSession.agentTipsHistory
      : detail.agentTipsHistory,
  };
}

export async function fetchQaProfile(settings: AppSettings) {
  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/qa-profile`,
  );

  const record = asRecord(response);
  return {
    companyId: readNumber(record, "companyId") ?? Number(settings.companyId),
    isConfigured: readBoolean(record, "isConfigured") ?? false,
    isEnabled: readBoolean(record, "isEnabled") ?? false,
    profileName: readString(record, "profileName") ?? "",
    definition: normalizeQaProfileDefinition(record.definition),
    createdAt: readString(record, "createdAt") ?? null,
    updatedAt: readString(record, "updatedAt") ?? null,
  } satisfies QaProfile;
}

export async function saveQaProfile(settings: AppSettings, profile: QaProfile) {
  const body = {
    isEnabled: profile.isEnabled,
    profileName: profile.profileName,
    definition: profile.definition,
  };

  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/qa-profile`,
    {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    },
  );

  const record = asRecord(response);
  return {
    companyId: readNumber(record, "companyId") ?? Number(settings.companyId),
    isConfigured: readBoolean(record, "isConfigured") ?? true,
    isEnabled: readBoolean(record, "isEnabled") ?? profile.isEnabled,
    profileName: readString(record, "profileName") ?? profile.profileName,
    definition: normalizeQaProfileDefinition(record.definition ?? profile.definition),
    createdAt: readString(record, "createdAt") ?? profile.createdAt ?? null,
    updatedAt: readString(record, "updatedAt") ?? profile.updatedAt ?? null,
  } satisfies QaProfile;
}

export async function fetchQaScoringSettings(settings: AppSettings) {
  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/qa-scoring-settings`,
  );

  return normalizeQaScoringSettings(response, settings.companyId);
}

export async function saveQaScoringSettings(
  settings: AppSettings,
  qaScoreMaximum: number,
  minScorableCallDurationSeconds: number | null,
  repeatContactAutoPassEnabled: boolean,
) {
  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/qa-scoring-settings`,
    {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        qaScoreMaximum,
        minScorableCallDurationSeconds,
        repeatContactAutoPassEnabled,
      }),
    },
  );

  return normalizeQaScoringSettings(
    response,
    settings.companyId,
    qaScoreMaximum,
    minScorableCallDurationSeconds,
    repeatContactAutoPassEnabled,
  );
}

export async function fetchWorkflowDestinations(settings: AppSettings) {
  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/workflow-destinations`,
  );

  return listFromResponse(response).map(normalizeWorkflowDestination);
}

export async function createWorkflowDestination(
  settings: AppSettings,
  destination: WorkflowDestinationInput,
) {
  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/workflow-destinations`,
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(destination),
    },
  );

  return normalizeWorkflowDestination(response);
}

export async function updateWorkflowDestination(
  settings: AppSettings,
  destinationId: string,
  patch: Partial<WorkflowDestinationInput>,
) {
  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/workflow-destinations/${destinationId}`,
    {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify(patch),
    },
  );

  return normalizeWorkflowDestination(response);
}

export async function deleteWorkflowDestination(settings: AppSettings, destinationId: string) {
  await request<void>(
    settings,
    `/api/companies/${settings.companyId}/workflow-destinations/${destinationId}`,
    {
      method: "DELETE",
    },
  );
}

const parseWorkflowTestResponse = async (
  response: Response,
): Promise<Pick<WorkflowTestResult, "ok" | "deliveryStatus" | "responseStatusCode" | "responseBody" | "error" | "raw">> => {
  const text = await response.text();
  if (!text.trim()) {
    return {
      ok: response.ok,
      responseStatusCode: null,
      responseBody: null,
      error: response.ok ? null : response.statusText,
    };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    const record = asRecord(parsed);
    const deliveryStatus = readString(record, "status") ?? null;
    const rawBody = record.responseBody ?? record.body ?? record.content;
    const responseBody =
      typeof rawBody === "string"
        ? rawBody
        : rawBody == null
          ? text
          : JSON.stringify(rawBody, null, 2);
    return {
      ok:
        deliveryStatus === "delivered"
          ? true
          : deliveryStatus === "failed"
            ? false
            : readBoolean(record, "success", "ok", "isSuccess") ?? response.ok,
      deliveryStatus,
      responseStatusCode: readNumber(record, "responseStatusCode", "statusCode") ?? null,
      responseBody,
      error: readString(record, "error", "errorMessage", "message") ?? (response.ok ? null : text),
      raw: parsed,
    };
  } catch {
    return {
      ok: response.ok,
      deliveryStatus: null,
      responseStatusCode: null,
      responseBody: text,
      error: response.ok ? null : text,
    };
  }
};

export async function testWorkflowDestination(
  settings: AppSettings,
  destinationId: string,
  conversationId: string | null,
): Promise<WorkflowTestResult> {
  const response = await fetch(
    buildUrl(
      settings,
      `/api/companies/${settings.companyId}/workflow-destinations/${destinationId}/test`,
    ),
    {
      method: "POST",
      headers: authHeaders(settings, jsonHeaders()),
      body: JSON.stringify({ conversationId }),
    },
  );

  if (response.status === 401) {
    const text = await response.text();
    throw createRequestError(text || "Unauthorized", response.status);
  }

  const parsed = await parseWorkflowTestResponse(response);
  return {
    status: response.status,
    ...parsed,
  };
}

export async function fetchWorkflowDeliveries(settings: AppSettings, destinationId: string) {
  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/workflow-destinations/${destinationId}/deliveries`,
  );

  return listFromResponse(response).map(normalizeWorkflowDelivery);
}

export async function recalculateQaScore(settings: AppSettings, conversationId: string) {
  const response = await fetch(
    buildUrl(
      settings,
      `/api/companies/${settings.companyId}/calls/${conversationId}/qa-score/recalculate`,
    ),
    {
      method: "POST",
      headers: authHeaders(settings),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw createRequestError(
      text || `QA recalculation failed with status ${response.status}`,
      response.status,
    );
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  return normalizeRecalculatedQaResult(JSON.parse(text));
}

export async function updateQaScore(
  settings: AppSettings,
  conversationId: string,
  reason: string,
  questionResults: QaQuestionCorrection[],
) {
  const response = await fetch(
    buildUrl(settings, `/api/companies/${settings.companyId}/calls/${conversationId}/qa-score`),
    {
      method: "PATCH",
      headers: authHeaders(settings, jsonHeaders()),
      body: JSON.stringify({ reason, questionResults }),
    },
  );

  if (!response.ok) {
    let message = "";
    const text = await response.text();
    if (text.trim()) {
      try {
        const body = JSON.parse(text) as Record<string, unknown>;
        const errors = asRecord(body.errors);
        const validationMessages = Object.values(errors)
          .flatMap((value) => asArray(value))
          .map(String)
          .filter(Boolean);
        message = validationMessages.join(" ") || String(body.message ?? body.error ?? body.title ?? text);
      } catch {
        message = text;
      }
    }
    throw createRequestError(message || `QA update failed with status ${response.status}`, response.status);
  }

  const body = (await response.json()) as unknown;
  return normalizeRecalculatedQaResult(body);
}

export async function updateQaApplicability(
  settings: AppSettings,
  conversationId: string,
  isApplicable: boolean,
  reason?: string,
) {
  const response = await fetch(
    buildUrl(
      settings,
      `/api/companies/${settings.companyId}/calls/${conversationId}/qa-applicability`,
    ),
    {
      method: "PATCH",
      headers: authHeaders(settings, jsonHeaders()),
      body: JSON.stringify(
        isApplicable
          ? { isApplicable: true }
          : { isApplicable: false, reason: reason?.trim() ?? "" },
      ),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    let message = "";

    if (text.trim()) {
      try {
        const body = JSON.parse(text) as Record<string, unknown>;
        const errors = asRecord(body.errors);
        const reasonErrors = asArray(errors.reason).map(String).filter(Boolean);
        const validationErrors = Object.values(errors)
          .flatMap((value) => asArray(value))
          .map(String)
          .filter(Boolean);
        message =
          reasonErrors[0] ??
          validationErrors[0] ??
          String(body.message ?? body.error ?? body.title ?? text);
      } catch {
        message = text;
      }
    }

    throw createRequestError(
      message || `QA applicability update failed with status ${response.status}`,
      response.status,
    );
  }

  const body = (await response.json()) as unknown;
  const qa = normalizeRecalculatedQaResult(body);
  if (!qa) {
    throw new Error("The server did not return updated QA applicability data.");
  }

  return qa;
}

export async function uploadCall(
  settings: AppSettings,
  payload: { conversationId: string; url: string; file: File | null },
) {
  const formData = new FormData();

  if (payload.url) {
    formData.set("url", payload.url);
  }

  if (payload.file) {
    formData.set("audio", payload.file);
  }

  const response = await fetch(
    buildUrl(settings, `/api/companies/${settings.companyId}/calls/${payload.conversationId}`),
    {
      method: "POST",
      headers: authHeaders(settings),
      body: formData,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw createRequestError(text || `Upload failed with status ${response.status}`, response.status);
  }
}

export async function fetchAudioBlob(settings: AppSettings, conversationId: string) {
  const response = await fetch(
    buildUrl(settings, `/api/companies/${settings.companyId}/calls/${conversationId}/audio`),
    {
      headers: authHeaders(settings),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw createRequestError(text || `Audio fetch failed with status ${response.status}`, response.status);
  }

  return response.blob();
}

export async function exportQaQuestionnaire(settings: AppSettings, conversationId: string) {
  const response = await fetch(
    buildUrl(settings, `/api/companies/${settings.companyId}/calls/${conversationId}/qa-export`),
    {
      method: "POST",
      headers: authHeaders(settings),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw createRequestError(text || `QA export failed with status ${response.status}`, response.status);
  }

  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileNameMatch =
    contentDisposition.match(/filename\*=UTF-8''([^;]+)/i) ??
    contentDisposition.match(/filename="?([^"]+)"?/i);
  const fileName = fileNameMatch?.[1]
    ? decodeURIComponent(fileNameMatch[1]).trim()
    : `${conversationId}-qa-export`;

  return {
    blob: await response.blob(),
    fileName,
  };
}

export async function requestAuthToken(settings: AppSettings): Promise<AuthTokenResponse> {
  const response = await fetch(buildUrl(settings, "/api/auth/token"), {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      companyId: Number(settings.companyId),
      apiToken: settings.apiToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw createRequestError(
      text || `Authorization failed with status ${response.status}`,
      response.status,
    );
  }

  const payload = (await response.json()) as unknown;
  const root = asRecord(payload);
  const record = Object.keys(asRecord(root.data)).length ? asRecord(root.data) : root;
  const user = asRecord(record.user ?? record.currentUser ?? record.identity);

  return {
    accessToken: readString(record, "accessToken", "token", "jwt") ?? "",
    tokenType: readString(record, "tokenType") ?? null,
    expiresAtUtc: readString(record, "expiresAtUtc", "expiresAt") ?? null,
    companyId:
      readNumber(record, "companyId") ??
      readStringLike(record, "companyId") ??
      readNumber(user, "companyId") ??
      readStringLike(user, "companyId") ??
      null,
    companyName:
      readString(record, "companyName") ?? readString(user, "companyName") ?? null,
    userRole:
      readString(record, "userRole", "role") ?? readString(user, "userRole", "role") ?? null,
    userId:
      readNumber(record, "userId") ??
      readStringLike(record, "userId") ??
      readNumber(user, "id", "userId") ??
      readStringLike(user, "id", "userId") ??
      null,
  };
}

export async function loginUser(
  settings: Pick<AppSettings, "baseUrl" | "companyId">,
  email: string,
  password: string,
): Promise<AppSettings> {
  const response = await fetch(
    `${trimSlash(settings.baseUrl)}/api/auth/login`,
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        companyId: Number(settings.companyId),
        email: email.trim(),
        password,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw createRequestError(
      response.status === 401
        ? "Invalid email or password."
        : response.status === 403
          ? "This user account is inactive or does not have permission to sign in."
          : text || `Sign in failed with status ${response.status}`,
      response.status,
    );
  }

  const payload = asRecord(await response.json());
  const data = Object.keys(asRecord(payload.data)).length ? asRecord(payload.data) : payload;
  const accessToken = readString(data, "accessToken", "token", "jwt") ?? "";
  if (!accessToken) {
    throw new Error("The login response did not include an access token.");
  }

  return hydrateAuthIdentity({
    baseUrl: settings.baseUrl,
    companyId: String(
      readNumber(data, "companyId") ??
      readStringLike(data, "companyId") ??
      settings.companyId,
    ),
    apiToken: "",
    accessToken,
    tokenType: readString(data, "tokenType") ?? "Bearer",
    expiresAtUtc: readString(data, "expiresAtUtc", "expiresAt") ?? null,
    companyName: readString(data, "companyName") ?? null,
    userRole: readString(data, "userRole", "role") ?? null,
    userId: readNumber(data, "userId") ?? readStringLike(data, "userId") ?? null,
  });
}

export async function changePassword(
  settings: AppSettings,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const response = await fetch(buildUrl(settings, "/api/auth/password"), {
    method: "PUT",
    headers: authHeaders(settings, jsonHeaders()),
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (response.ok) return;

  const raw = await response.text();
  let message = raw;
  try {
    message = readString(asRecord(JSON.parse(raw)), "message") ?? raw;
  } catch {
    // The API may return plain text for unexpected failures.
  }

  throw createRequestError(
    message || `Password change failed with status ${response.status}`,
    response.status,
  );
}

const readJwtClaims = (accessToken: string): Record<string, unknown> => {
  try {
    const encodedPayload = accessToken.split(".")[1];
    if (!encodedPayload) return {};
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return asRecord(JSON.parse(atob(padded)));
  } catch {
    return {};
  }
};

export const hydrateAuthIdentity = (settings: AppSettings): AppSettings => {
  const claims = readJwtClaims(settings.accessToken);
  return {
    ...settings,
    userRole:
      (settings.userRole?.trim() || undefined) ??
      readString(
        claims,
        "userRole",
        "role",
        "http://schemas.microsoft.com/ws/2008/06/identity/claims/role",
      ) ??
      null,
    userId:
      (settings.userId != null && String(settings.userId).trim()
        ? settings.userId
        : undefined) ??
      readStringLike(
        claims,
        "userId",
        "sub",
        "nameid",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
      ) ??
      null,
  };
};

export async function authorizeSettings(settings: AppSettings): Promise<AppSettings> {
  const auth = await requestAuthToken(settings);

  return hydrateAuthIdentity({
    ...settings,
    companyId:
      auth.companyId != null && auth.companyId !== "" ? String(auth.companyId) : settings.companyId,
    accessToken: auth.accessToken,
    tokenType: auth.tokenType ?? "Bearer",
    companyName: auth.companyName ?? settings.companyName ?? null,
    expiresAtUtc: auth.expiresAtUtc ?? settings.expiresAtUtc ?? null,
    userRole: auth.userRole ?? settings.userRole ?? null,
    userId: auth.userId ?? settings.userId ?? null,
  });
}

const normalizeAgent = (value: unknown): CompanyAgent => {
  const record = asRecord(value);
  return {
    id: readNumber(record, "id", "agentId") ?? 0,
    name: readString(record, "name", "displayName", "fullName") ?? "Unnamed agent",
    externalId: readStringLike(record, "externalId", "externalAgentId") ?? null,
  };
};

const normalizeCompanyUser = (value: unknown): CompanyUser => {
  const record = asRecord(value);
  const status = readString(record, "status");
  return {
    id: readNumber(record, "id", "userId") ?? 0,
    name: readString(record, "name", "displayName", "fullName") ?? "",
    email: readString(record, "email") ?? "",
    role: readString(record, "role")?.toLowerCase() === "admin" ? "Admin" : "User",
    isActive:
      readBoolean(record, "isActive", "active") ?? status?.toLowerCase() !== "inactive",
    assignedAgents: asArray(
      record.assignedAgents ?? record.agents ?? record.agentAssignments,
    ).map(normalizeAgent),
    createdUtc: readString(record, "createdUtc", "createdAtUtc", "createdAt") ?? null,
    lastLoginUtc:
      readString(record, "lastLoginUtc", "lastLoginAtUtc", "lastLoginAt") ?? null,
  };
};

export async function fetchCompanyUsers(settings: AppSettings) {
  const payload = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/users`,
  );
  const record = asRecord(payload);
  return asArray(record.items ?? record.users ?? payload).map(normalizeCompanyUser);
}

export async function fetchCompanyAgents(settings: AppSettings) {
  const payload = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/agents`,
  );
  const record = asRecord(payload);
  return asArray(record.items ?? record.agents ?? payload).map(normalizeAgent);
}

export async function createCompanyUser(settings: AppSettings, input: CompanyUserInput) {
  const payload = await request<unknown>(settings, `/api/companies/${settings.companyId}/users`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
  return normalizeCompanyUser(payload);
}

export async function updateCompanyUser(
  settings: AppSettings,
  userId: number,
  input: Pick<CompanyUserInput, "name" | "role">,
) {
  return request<void>(settings, `/api/companies/${settings.companyId}/users/${userId}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });
}

export async function updateCompanyUserStatus(
  settings: AppSettings,
  userId: number,
  isActive: boolean,
) {
  return request<void>(
    settings,
    `/api/companies/${settings.companyId}/users/${userId}/status`,
    {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ isActive }),
    },
  );
}

export async function resetCompanyUserPassword(
  settings: AppSettings,
  userId: number,
  password: string,
) {
  return request<void>(
    settings,
    `/api/companies/${settings.companyId}/users/${userId}/password`,
    {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ password }),
    },
  );
}

export async function assignCompanyUserAgents(
  settings: AppSettings,
  userId: number,
  agentIds: number[],
) {
  return request<void>(
    settings,
    `/api/companies/${settings.companyId}/users/${userId}/agents`,
    {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ agentIds }),
    },
  );
}
