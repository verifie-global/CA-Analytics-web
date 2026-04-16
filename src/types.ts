export type Sentiment = "positive" | "neutral" | "negative" | string;

export type CallFilters = {
  page: number;
  pageSize: number;
  search: string;
  conversationId: string;
  status: string;
  sentiment: string;
  hasError: string;
};

export type AppSettings = {
  baseUrl: string;
  companyId: string;
  apiToken: string;
  accessToken: string;
  tokenType?: string | null;
  companyName?: string | null;
  expiresAtUtc?: string | null;
};

export type AuthTokenResponse = {
  accessToken: string;
  tokenType?: string | null;
  expiresAtUtc?: string | null;
  companyId?: number | string | null;
  companyName?: string | null;
};

export type CallSummary = {
  conversationId: string;
  status: string;
  sentiment?: Sentiment;
  satisfactionScore?: number | null;
  friendlinessScore?: number | null;
  durationSeconds?: number | null;
  language?: string | null;
  createdUtc?: string | null;
  completedUtc?: string | null;
  hasError?: boolean;
  error?: string | null;
  raw: unknown;
};

export type SpeakerSegment = {
  speaker: string;
  role?: "AGENT" | "CUSTOMER" | "UNKNOWN";
  startMs?: number | null;
  endMs?: number | null;
  text: string;
};

export type CallDetail = {
  conversationId: string;
  status: string;
  transcript?: string | null;
  redactedTranscript?: string | null;
  summary?: string | null;
  sentiment?: Sentiment;
  satisfactionScore?: number | null;
  friendlinessScore?: number | null;
  durationSeconds?: number | null;
  language?: string | null;
  createdUtc?: string | null;
  completedUtc?: string | null;
  error?: string | null;
  segments: SpeakerSegment[];
  entities: Record<string, unknown>;
  analysis: Record<string, unknown>;
  raw: Record<string, unknown>;
};
