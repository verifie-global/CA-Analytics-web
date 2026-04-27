import type {
  AppSettings,
  AuthTokenResponse,
  CallDetail,
  CallFilters,
  CallSummary,
  QaEvaluation,
  QaProfile,
  QaProfileDefinition,
  QaQuestionDefinition,
  QaQuestionResult,
  QaResult,
  SpeakerSegment,
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

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

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

const readNumber = (record: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
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

const toSegments = (value: unknown): SpeakerSegment[] =>
  asArray(value)
    .map((item) => asRecord(item))
    .map((segment) => {
      const speaker =
        readString(segment, "speaker", "speakerName", "speakerLabel") ?? "Speaker";
      const normalizedSpeaker = speaker.toUpperCase();
      const role: "AGENT" | "CUSTOMER" | "UNKNOWN" =
        normalizedSpeaker === "AGENT" || normalizedSpeaker === "CUSTOMER"
          ? (normalizedSpeaker as "AGENT" | "CUSTOMER")
          : "UNKNOWN";

      return {
        speaker,
        role,
        startMs: readNumber(segment, "startMs", "start", "offsetMs"),
        endMs: readNumber(segment, "endMs", "end"),
        text: readString(segment, "text", "transcript") ?? "",
      };
    })
    .filter((segment) => segment.text);

const normalizeCallSummary = (item: unknown): CallSummary => {
  const record = asRecord(item);
  const rawAnalysis = asRecord(record.analysis);
  const qa = asRecord(record.qa);

  return {
    conversationId: readString(record, "conversationId", "id") ?? "unknown",
    status: readString(record, "status") ?? "Unknown",
    sentiment: readString(record, "sentiment") ?? readString(rawAnalysis, "sentiment"),
    satisfactionScore:
      readNumber(record, "satisfactionScore") ?? readNumber(rawAnalysis, "satisfactionScore"),
    friendlinessScore: readNumber(record, "friendlinessScore"),
    qaScore: readNumber(record, "qaScore") ?? readNumber(qa, "score"),
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
  return {
    id: readString(record, "id") ?? "",
    title: readString(record, "title") ?? "",
    description: readString(record, "description") ?? "",
    weight: readNumber(record, "weight") ?? 0,
    score: readNumber(record, "score") ?? 0,
    reason: readString(record, "reason") ?? "",
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

  return {
    score: readNumber(record, "score") ?? null,
    earnedPoints: readNumber(record, "earnedPoints") ?? null,
    possiblePoints: readNumber(record, "possiblePoints") ?? null,
    evaluation: normalizeQaEvaluation(record.evaluation),
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

export async function fetchCalls(settings: AppSettings, filters: CallFilters) {
  const query = new URLSearchParams({
    Page: String(filters.page),
    PageSize: String(filters.pageSize),
  });

  if (filters.search) query.set("Search", filters.search);
  if (filters.conversationId) query.set("ConversationId", filters.conversationId);
  if (filters.status) query.set("Status", filters.status);
  if (filters.sentiment) query.set("Sentiment", filters.sentiment);
  if (filters.hasError) query.set("HasError", filters.hasError);
  if (filters.minQaScore) query.set("minQaScore", filters.minQaScore);
  if (filters.maxQaScore) query.set("maxQaScore", filters.maxQaScore);

  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/calls`,
    undefined,
    query,
  );

  return listFromResponse(response).map(normalizeCallSummary);
}

export async function fetchCallDetail(settings: AppSettings, conversationId: string) {
  const response = await request<unknown>(
    settings,
    `/api/companies/${settings.companyId}/calls/${conversationId}`,
  );

  return normalizeCallDetail(response);
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

export async function recalculateQaScore(settings: AppSettings, conversationId: string) {
  await request<void>(
    settings,
    `/api/companies/${settings.companyId}/calls/${conversationId}/qa-score/recalculate`,
    {
      method: "POST",
    },
  );
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

  return (await response.json()) as AuthTokenResponse;
}

export async function authorizeSettings(settings: AppSettings): Promise<AppSettings> {
  const auth = await requestAuthToken(settings);

  return {
    ...settings,
    companyId:
      auth.companyId != null && auth.companyId !== "" ? String(auth.companyId) : settings.companyId,
    accessToken: auth.accessToken,
    tokenType: auth.tokenType ?? "Bearer",
    companyName: auth.companyName ?? settings.companyName ?? null,
    expiresAtUtc: auth.expiresAtUtc ?? settings.expiresAtUtc ?? null,
  };
}
