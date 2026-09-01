import type {
  AppSettings,
  AskEvidence,
  AskResponse,
  AuthTokenResponse,
  CallDetail,
  CallFilterOption,
  CallFilterOptions,
  CallFilters,
  CallUploadPayload,
  CallUploadResult,
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
  QaScoringSettingsUpdate,
  QaScoringMode,
  ScoreMetricSummary,
  SpeakerSegment,
  TextConnectorNormalizeResult,
  TextConnectorNormalizedEvent,
  TextConnectorPocCatalogItem,
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
  VoiceConnectorAccount,
  VoiceConnectorAuditEvent,
  VoiceConnectorCatalogItem,
  VoiceConnectorTestResult,
  VoiceConnectorUpdate,
  LocaleCode,
  UiLocalizationOptionsResponse,
  UpdateCompanyUserRequest,
} from "./types";
import {
  DEFAULT_QA_SCORE_MAXIMUM,
  DEFAULT_QA_SCORING_MODE,
} from "./qaDisplay";

export type RequestError = Error & {
  status?: number;
  fieldErrors?: Record<string, string>;
};

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const readLocaleCode = (value: unknown): LocaleCode | null => {
  if (typeof value !== "string") return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return base === "en" || base === "hy" || base === "ru" ? base : null;
};

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

const defaultLocalizationOptions: UiLocalizationOptionsResponse = {
  defaultLocale: "en",
  supportedLocales: [
    { code: "en", englishName: "English", nativeName: "English", textDirection: "ltr" },
    { code: "hy", englishName: "Armenian", nativeName: "Հայերեն", textDirection: "ltr" },
    { code: "ru", englishName: "Russian", nativeName: "Русский", textDirection: "ltr" },
  ],
};

export async function fetchLocalizationOptions(
  baseUrl: string,
): Promise<UiLocalizationOptionsResponse> {
  const response = await fetch(`${trimSlash(baseUrl)}/api/localization/options`);
  if (!response.ok) {
    throw createRequestError(
      `Localization options request failed with status ${response.status}`,
      response.status,
    );
  }
  const root = asRecord(await response.json());
  const record = Object.keys(asRecord(root.data)).length ? asRecord(root.data) : root;
  const supportedLocales = asArray(record.supportedLocales)
    .map((entry) => {
      const locale = asRecord(entry);
      const code = readLocaleCode(locale.code);
      if (!code) return null;
      const fallback = defaultLocalizationOptions.supportedLocales.find(
        (option) => option.code === code,
      )!;
      return {
        code,
        englishName: readString(locale, "englishName") ?? fallback.englishName,
        nativeName: readString(locale, "nativeName") ?? fallback.nativeName,
        textDirection: readString(locale, "textDirection") === "rtl" ? "rtl" as const : "ltr" as const,
      };
    })
    .filter((entry): entry is UiLocalizationOptionsResponse["supportedLocales"][number] => Boolean(entry));
  return {
    defaultLocale: readLocaleCode(record.defaultLocale) ?? "en",
    supportedLocales: supportedLocales.length > 0 ? supportedLocales : defaultLocalizationOptions.supportedLocales,
  };
}

const parseRequestFieldErrors = (text: string): Record<string, string> => {
  try {
    const errors = asRecord(asRecord(JSON.parse(text)).errors);
    const result: Record<string, string> = {};
    const visit = (field: string, value: unknown) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        Object.entries(value as Record<string, unknown>).forEach(([child, childValue]) =>
          visit(field ? `${field}.${child}` : child, childValue));
        return;
      }
      const message = (Array.isArray(value) ? value : [value])
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
        .join(" ");
      if (message) result[field] = message;
    };
    Object.entries(errors).forEach(([field, value]) => visit(field, value));
    return result;
  } catch {
    return {};
  }
};

const createRequestError = (
  message: string,
  status: number,
  fieldErrors?: Record<string, string>,
): RequestError => {
  const error = new Error(message) as RequestError;
  error.status = status;
  if (fieldErrors && Object.keys(fieldErrors).length > 0) error.fieldErrors = fieldErrors;
  return error;
};

const parseRequestErrorMessage = (text: string, fallback: string) => {
  const trimmed = text.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const body = JSON.parse(trimmed) as unknown;
    const record = asRecord(body);
    const validationMessages = Object.values(parseRequestFieldErrors(trimmed));

    if (validationMessages.length > 0) {
      return validationMessages.join(" ");
    }

    return (
      readString(record, "message", "detail", "error", "title") ??
      fallback
    );
  } catch {
    return trimmed;
  }
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
    throw createRequestError(
      parseRequestErrorMessage(text, `Request failed with status ${response.status}`),
      response.status,
      parseRequestFieldErrors(text),
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

const unwrapArray = (payload: unknown, ...keys: string[]): unknown[] => {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  const data = record.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return unwrapArray(data, ...keys);
  return [];
};

export async function fetchVoiceConnectorCatalog(
  settings: AppSettings,
): Promise<VoiceConnectorCatalogItem[]> {
  const payload = await request<unknown>(settings, "/api/v1/admin/connectors/catalog");
  return unwrapArray(payload, "items", "providers", "catalog") as VoiceConnectorCatalogItem[];
}

const readTextArray = (value: unknown) =>
  asArray(value)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

const nullableText = (record: Record<string, unknown>, ...keys: string[]) =>
  readStringLike(record, ...keys) ?? null;

const normalizeTextConnectorEvent = (value: unknown): TextConnectorNormalizedEvent => {
  const record = asRecord(value);
  return {
    provider: readString(record, "provider") ?? "unknown",
    eventId: readStringLike(record, "eventId", "event_id") ?? "",
    eventType: readString(record, "eventType", "event_type") ?? "unknown",
    providerEventType: nullableText(record, "providerEventType", "provider_event_type"),
    externalConversationId: nullableText(
      record,
      "externalConversationId",
      "external_conversation_id",
    ),
    externalMessageId: nullableText(record, "externalMessageId", "external_message_id"),
    channelId: nullableText(record, "channelId", "channel_id"),
    channel: nullableText(record, "channel"),
    direction: nullableText(record, "direction"),
    senderRole: nullableText(record, "senderRole", "sender_role"),
    senderExternalId: nullableText(record, "senderExternalId", "sender_external_id"),
    senderName: nullableText(record, "senderName", "sender_name"),
    occurredAt: nullableText(record, "occurredAt", "occurred_at"),
    text: nullableText(record, "text"),
    attachments: asArray(record.attachments)
      .map((item) => asRecord(item))
      .filter((item) => Object.keys(item).length > 0),
    requiresHydration:
      readBoolean(record, "requiresHydration", "requires_hydration") ?? false,
    warnings: readTextArray(record.warnings),
  };
};

export async function fetchTextConnectorPocCatalog(
  settings: AppSettings,
): Promise<TextConnectorPocCatalogItem[]> {
  const payload = await request<unknown>(
    settings,
    "/api/v1/admin/text-connectors/poc/catalog",
  );

  return unwrapArray(payload, "items", "providers", "catalog").map((value) => {
    const record = asRecord(value);
    return {
      provider: readString(record, "provider") ?? "unknown",
      displayName:
        readString(record, "displayName", "display_name") ??
        readString(record, "provider") ??
        "Unknown provider",
      documentationUrl:
        readString(record, "documentationUrl", "documentation_url") ?? "",
      messageEvents: readTextArray(record.messageEvents ?? record.message_events),
      conversationEvents: readTextArray(
        record.conversationEvents ?? record.conversation_events,
      ),
      supportsHistoryApi:
        readBoolean(record, "supportsHistoryApi", "supports_history_api") ?? false,
      historyValidationNote:
        readString(record, "historyValidationNote", "history_validation_note") ?? "",
      securityValidationNote:
        readString(record, "securityValidationNote", "security_validation_note") ?? "",
    };
  });
}

export async function normalizeTextConnectorWebhook(
  settings: AppSettings,
  provider: string,
  sourcePayload: unknown,
): Promise<TextConnectorNormalizeResult> {
  const payload = await request<unknown>(
    settings,
    `/api/v1/admin/text-connectors/poc/${encodeURIComponent(provider)}/normalize`,
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(sourcePayload),
    },
  );
  const root = asRecord(payload);
  const record = asOptionalRecord(root.data) ?? root;

  return {
    normalized: normalizeTextConnectorEvent(record.normalized),
    sourcePayload: record.sourcePayload ?? record.source_payload ?? sourcePayload,
  };
}

export async function fetchVoiceConnectorAccounts(
  settings: AppSettings,
): Promise<VoiceConnectorAccount[]> {
  const payload = await request<unknown>(settings, "/api/v1/admin/connectors/");
  return unwrapArray(payload, "items", "connectors", "accounts") as VoiceConnectorAccount[];
}

export function fetchVoiceConnectorAccount(settings: AppSettings, provider: string) {
  return request<VoiceConnectorAccount>(
    settings,
    `/api/v1/admin/connectors/${encodeURIComponent(provider)}`,
  );
}

export function updateVoiceConnector(
  settings: AppSettings,
  provider: string,
  input: VoiceConnectorUpdate,
) {
  return request<VoiceConnectorAccount>(
    settings,
    `/api/v1/admin/connectors/${encodeURIComponent(provider)}`,
    { method: "PUT", headers: jsonHeaders(), body: JSON.stringify(input) },
  );
}

export function testVoiceConnector(settings: AppSettings, provider: string) {
  return request<VoiceConnectorTestResult>(
    settings,
    `/api/v1/admin/connectors/${encodeURIComponent(provider)}/test`,
    { method: "POST", headers: jsonHeaders() },
  );
}

export async function fetchVoiceConnectorAudit(
  settings: AppSettings,
  provider: string,
  limit = 25,
): Promise<VoiceConnectorAuditEvent[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  const payload = await request<unknown>(
    settings,
    `/api/v1/admin/connectors/${encodeURIComponent(provider)}/audit`,
    undefined,
    query,
  );
  return unwrapArray(payload, "items", "events", "audit") as VoiceConnectorAuditEvent[];
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

const readQaScoringMode = (
  record: Record<string, unknown>,
  ...keys: string[]
): QaScoringMode | undefined => {
  const value = readString(record, ...keys);
  return value === "weighted_ratio" || value === "subtract_failed_weights"
    ? value
    : undefined;
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
    conversationName: readString(record, "conversationName"),
    originalAudioFileName: readString(record, "originalAudioFileName"),
    status: readString(record, "status") ?? "Unknown",
    source: readString(record, "source"),
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
    conversationName: readString(record, "conversationName"),
    originalAudioFileName: readString(record, "originalAudioFileName"),
    status: readString(record, "status") ?? "Unknown",
    source: readString(record, "source"),
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
  fallbackQaScoreMaximum = DEFAULT_QA_SCORE_MAXIMUM,
  fallbackQaScoringMode: QaScoringMode = DEFAULT_QA_SCORING_MODE,
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
    qaScoringMode:
      readQaScoringMode(record, "qaScoringMode") ?? fallbackQaScoringMode,
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
    responseLocale: readLocaleCode(record.responseLocale) ?? "en",
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
  responseLocale: LocaleCode = "en",
) {
  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/calls/${conversationId}/ask`,
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ question, responseLocale }),
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
    responseLocale?: LocaleCode;
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
        responseLocale: payload.responseLocale ?? "en",
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
    `/api/companies/${settings.companyId}/calls/${encodeURIComponent(conversationId)}`,
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
    qaScoreMaximum:
      readNumber(record, "qaScoreMaximum") ?? DEFAULT_QA_SCORE_MAXIMUM,
    qaScoringMode:
      readQaScoringMode(record, "qaScoringMode") ?? DEFAULT_QA_SCORING_MODE,
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
    qaScoreMaximum:
      readNumber(record, "qaScoreMaximum") ?? profile.qaScoreMaximum,
    qaScoringMode:
      readQaScoringMode(record, "qaScoringMode") ?? profile.qaScoringMode,
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
  update: QaScoringSettingsUpdate,
) {
  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/qa-scoring-settings`,
    {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify(update),
    },
  );

  return normalizeQaScoringSettings(
    response,
    settings.companyId,
    update.qaScoreMaximum,
    update.qaScoringMode,
    update.minScorableCallDurationSeconds,
    update.repeatContactAutoPassEnabled,
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
  payload: CallUploadPayload,
): Promise<CallUploadResult> {
  const url = payload.url?.trim() ?? "";
  const transcript = payload.transcript ?? "";

  if (!payload.conversationId.trim()) {
    throw createRequestError("Invalid input: conversation ID is required.", 400);
  }

  if (transcript.length > 250_000) {
    throw createRequestError(
      "Invalid input: transcript/chat text cannot exceed 250,000 characters.",
      400,
    );
  }

  const suppliedSourceCount = [Boolean(payload.file), Boolean(url), Boolean(transcript.trim())]
    .filter(Boolean).length;

  if (suppliedSourceCount !== 1) {
    throw createRequestError(
      "Invalid input: provide exactly one audio file, audio URL, or transcript.",
      400,
    );
  }

  const formData = new FormData();

  if (url) {
    formData.set("url", url);
  }

  if (payload.file) {
    formData.set("audio", payload.file);
  }

  if (transcript.trim()) {
    formData.set("transcript", transcript);
  }

  if (payload.language && payload.language !== "auto") {
    formData.set("language", payload.language);
  }

  const metadata = payload.metadata;
  const textMetadata = {
    agentName: metadata?.agentName,
    agentExternalId: metadata?.agentExternalId,
    agentPhone: metadata?.agentPhone,
    customerName: metadata?.customerName,
    customerExternalId: metadata?.customerExternalId,
    customerPhone: metadata?.customerPhone,
  };

  Object.entries(textMetadata).forEach(([key, value]) => {
    const normalizedValue = value?.trim();
    if (normalizedValue) formData.set(key, normalizedValue);
  });

  if (metadata?.isInbound != null) {
    formData.set("isInbound", String(metadata.isInbound));
  }

  if (metadata?.billSeconds != null) {
    formData.set("billSeconds", String(metadata.billSeconds));
  }

  const response = await fetch(
    buildUrl(
      settings,
      `/api/companies/${settings.companyId}/calls/${encodeURIComponent(payload.conversationId)}`,
    ),
    {
      method: "POST",
      headers: authHeaders(settings),
      body: formData,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    const serverMessage = parseRequestErrorMessage(
      text,
      `Upload failed with status ${response.status}`,
    );
    const message =
      response.status === 400
        ? `Invalid input: ${serverMessage}`
        : response.status === 401
          ? "Authentication expired or is invalid. Please sign in again."
          : response.status === 409
            ? "This conversation ID already exists. Generate a new ID and try again."
            : serverMessage;
    throw createRequestError(
      message,
      response.status,
    );
  }

  const fallback: CallUploadResult = {
    conversationId: payload.conversationId,
    originalAudioFileName: payload.file?.name,
    status: response.status === 202 ? "Queued" : undefined,
    source: transcript.trim() ? "transcript" : "audio",
    language: payload.language && payload.language !== "auto" ? payload.language : null,
    agentInfo: normalizePartyInfo(null, {
      name: metadata?.agentName,
      externalId: metadata?.agentExternalId,
      phone: metadata?.agentPhone,
    }),
    customerInfo: normalizePartyInfo(null, {
      name: metadata?.customerName,
      externalId: metadata?.customerExternalId,
      phone: metadata?.customerPhone,
    }),
    isInbound: metadata?.isInbound ?? null,
    billSeconds: metadata?.billSeconds ?? null,
  };
  const text = await response.text();
  if (!text.trim()) {
    return fallback;
  }

  try {
    const body = asRecord(JSON.parse(text) as unknown);
    const record = asOptionalRecord(body.call) ?? asOptionalRecord(body.data) ?? body;
    const responseMetadata =
      asOptionalRecord(record.metadata) ?? asOptionalRecord(record.callMetadata) ?? {};
    return {
      conversationId:
        readString(record, "conversationId", "id") ?? payload.conversationId,
      conversationDbId:
        readNumber(record, "conversationDbId") ??
        readString(record, "conversationDbId") ??
        null,
      conversationName: readString(record, "conversationName"),
      originalAudioFileName:
        readString(record, "originalAudioFileName") ?? payload.file?.name,
      status: readString(record, "status") ?? fallback.status,
      source: readString(record, "source") ?? fallback.source,
      language:
        readString(record, "language", "detectedLanguage", "selectedLanguage") ??
        fallback.language,
      agentInfo: normalizePartyInfo(record.agentInfo ?? responseMetadata.agentInfo, {
        name:
          readString(record, "agentName") ??
          readString(responseMetadata, "agentName") ??
          metadata?.agentName,
        externalId:
          readString(record, "agentExternalId") ??
          readString(responseMetadata, "agentExternalId") ??
          metadata?.agentExternalId,
        phone:
          readString(record, "agentPhone") ??
          readString(responseMetadata, "agentPhone") ??
          metadata?.agentPhone,
      }),
      customerInfo: normalizePartyInfo(record.customerInfo ?? responseMetadata.customerInfo, {
        name:
          readString(record, "customerName") ??
          readString(responseMetadata, "customerName") ??
          metadata?.customerName,
        externalId:
          readString(record, "customerExternalId") ??
          readString(responseMetadata, "customerExternalId") ??
          metadata?.customerExternalId,
        phone:
          readString(record, "customerPhone") ??
          readString(responseMetadata, "customerPhone") ??
          metadata?.customerPhone,
      }),
      isInbound:
        readBoolean(record, "isInbound") ??
        readBoolean(responseMetadata, "isInbound") ??
        fallback.isInbound,
      billSeconds:
        readNumber(record, "billSeconds") ??
        readNumber(responseMetadata, "billSeconds") ??
        fallback.billSeconds,
    };
  } catch {
    return fallback;
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
    preferredLocale:
      readLocaleCode(record.preferredLocale ?? user.preferredLocale) ?? "en",
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
    preferredLocale: readLocaleCode(data.preferredLocale) ?? "en",
  });
}

export async function fetchCurrentUser(settings: AppSettings): Promise<Partial<AppSettings>> {
  const payload = await request<unknown>(settings, "/api/auth/me");
  const root = asRecord(payload);
  const record = Object.keys(asRecord(root.data)).length ? asRecord(root.data) : root;
  const company = asRecord(record.company);
  return {
    companyId: String(
      readNumber(record, "companyId") ??
      readStringLike(record, "companyId") ??
      settings.companyId,
    ),
    companyName:
      readString(record, "companyName") ??
      readString(company, "name", "companyName") ??
      settings.companyName ??
      null,
    userRole: readString(record, "userRole", "role") ?? settings.userRole ?? null,
    userId:
      readNumber(record, "userId", "id") ??
      readStringLike(record, "userId", "id") ??
      settings.userId ??
      null,
    preferredLocale: readLocaleCode(record.preferredLocale) ?? "en",
  };
}

export async function updatePreferredLocale(
  settings: AppSettings,
  preferredLocale: LocaleCode,
): Promise<LocaleCode> {
  const payload = await request<unknown>(settings, "/api/auth/preferences", {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ preferredLocale }),
  });
  const root = asRecord(payload);
  const record = Object.keys(asRecord(root.data)).length ? asRecord(root.data) : root;
  return readLocaleCode(record.preferredLocale) ?? "en";
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
    preferredLocale: readLocaleCode(settings.preferredLocale) ?? settings.preferredLocale ?? null,
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
    preferredLocale: auth.preferredLocale ?? "en",
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
    preferredLocale: readLocaleCode(record.preferredLocale) ?? "en",
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
  input: UpdateCompanyUserRequest,
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
