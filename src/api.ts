import type { AppSettings, CallDetail, CallFilters, CallSummary, SpeakerSegment } from "./types";

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const buildUrl = (settings: AppSettings, path: string, query?: URLSearchParams) => {
  const url = `${trimSlash(settings.baseUrl)}${path}`;
  return query ? `${url}?${query.toString()}` : url;
};

const authHeaders = (settings: AppSettings, extra?: HeadersInit) => ({
  Authorization: `Bearer ${settings.token}`,
  ...extra,
});

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
    throw new Error(text || `Request failed with status ${response.status}`);
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

  return {
    conversationId: readString(record, "conversationId", "id") ?? "unknown",
    status: readString(record, "status") ?? "Unknown",
    sentiment: readString(record, "sentiment") ?? readString(rawAnalysis, "sentiment"),
    satisfactionScore:
      readNumber(record, "satisfactionScore") ?? readNumber(rawAnalysis, "satisfactionScore"),
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
    durationSeconds: readNumber(record, "durationSeconds", "callDurationSeconds"),
    language: readString(record, "language"),
    createdUtc: readString(record, "createdUtc", "createdAtUtc", "createdAt"),
    completedUtc: readString(record, "completedUtc", "completedAtUtc", "completedAt"),
    error: readString(record, "error"),
    segments,
    entities,
    analysis: rawAnalysis,
    raw: record,
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
    throw new Error(text || `Upload failed with status ${response.status}`);
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
    throw new Error(text || `Audio fetch failed with status ${response.status}`);
  }

  return response.blob();
}

export async function verifyAuthorization(settings: AppSettings) {
  await fetchCalls(settings, {
    page: 1,
    pageSize: 1,
    search: "",
    conversationId: "",
    status: "",
    sentiment: "",
    hasError: "",
  });
}
