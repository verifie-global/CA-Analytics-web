export type Sentiment = "positive" | "neutral" | "negative" | string;

export type CallFilters = {
  page: number;
  pageSize: number;
  search: string;
  conversationId: string;
  status: string;
  sentiment: string;
  hasError: string;
  minQaScore: string;
  maxQaScore: string;
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
  qaScore?: number | null;
  qaEarnedPoints?: number | null;
  qaPossiblePoints?: number | null;
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
  qa?: QaResult | null;
  segments: SpeakerSegment[];
  entities: Record<string, unknown>;
  analysis: Record<string, unknown>;
  raw: Record<string, unknown>;
};

export type QaQuestionDefinition = {
  id: string;
  title: string;
  description: string;
  weight: number;
  isEnabled: boolean;
};

export type QaProfileDefinition = {
  businessContext: string;
  mainGoalOfCallEvaluation: string;
  businessPriorities: string[];
  targetBusinessOutcome: string;
  sentimentRules: string;
  satisfactionRules: string;
  friendlinessRules: string;
  resolutionRules: string;
  urgencyRules: string;
  departmentRules: string;
  complianceRules: string;
  additionalInstructions: string;
  questions: QaQuestionDefinition[];
};

export type QaProfile = {
  companyId: number;
  isConfigured: boolean;
  isEnabled: boolean;
  profileName: string;
  definition: QaProfileDefinition;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type QaQuestionResult = {
  id: string;
  title: string;
  description: string;
  weight: number;
  score: number;
  reason: string;
};

export type QaEvaluation = {
  profileName?: string | null;
  overallComment?: string | null;
  strengths: string[];
  improvements: string[];
  resolutionStatus?: string | null;
  questionResults: QaQuestionResult[];
  generatedAtUtc?: string | null;
};

export type QaResult = {
  score?: number | null;
  earnedPoints?: number | null;
  possiblePoints?: number | null;
  evaluation?: QaEvaluation | null;
};
