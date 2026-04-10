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
  token: string;
};

export type CallSummary = {
  conversationId: string;
  status: string;
  sentiment?: Sentiment;
  satisfactionScore?: number | null;
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
