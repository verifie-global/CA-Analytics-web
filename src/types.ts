export type Sentiment = "positive" | "neutral" | "negative" | string;

export type CallFilters = {
  page: number;
  pageSize: number;
  search: string;
  conversationId: string;
  createdFromUtc: string;
  createdToUtc: string;
  status: string;
  sentiment: string;
  minQaScore: string;
  maxQaScore: string;
  agentName: string;
  agentNames: string[];
  agentExternalId: string;
  agentExternalIds: string[];
  agentPhone: string;
  agentPhones: string[];
  customerName: string;
  customerNames: string[];
  customerExternalId: string;
  customerExternalIds: string[];
  customerPhone: string;
  customerPhones: string[];
};

export type ScoreMetricSummary = {
  cumulative?: number | null;
  average?: number | null;
  scoredCount?: number | null;
  missingCount?: number | null;
  notApplicableCount?: number | null;
};

export type CallScoreSummary = {
  callCount?: number | null;
  customerSatisfactionScore?: ScoreMetricSummary | null;
  agentFriendlinessScore?: ScoreMetricSummary | null;
  qaScore?: ScoreMetricSummary | null;
};

export type CallsListResult = {
  companyId?: number | null;
  page: number;
  pageSize: number;
  total: number;
  scoreSummary?: CallScoreSummary | null;
  items: CallSummary[];
};

export type CallFilterOption = {
  name?: string | null;
  phone: string;
};

export type CallFilterOptions = {
  agents: CallFilterOption[];
  customers: CallFilterOption[];
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
  agentInfo?: PartyInfo | null;
  customerInfo?: PartyInfo | null;
  sentiment?: Sentiment;
  satisfactionScore?: number | null;
  friendlinessScore?: number | null;
  qaScore?: number | null;
  qaIsApplicable?: boolean | null;
  qaStatus?: string | null;
  qaNotApplicableReason?: string | null;
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

export type EmotionInfo = {
  label?: string | null;
  rawLabel?: string | null;
  confidence?: number | null;
  scores?: Record<string, number> | null;
  rawScores?: Record<string, number> | null;
  model?: string | null;
};

export type SegmentEmotion = EmotionInfo;

export type DiarizationSegment = {
  speaker: string;
  speakerLabel?: string;
  start?: number | null;
  end?: number | null;
  startMs?: number | null;
  endMs?: number | null;
  text?: string | null;
  emotionLabel?: string | null;
  emotionRawLabel?: string | null;
  emotionConfidence?: number | null;
  emotionScores?: Record<string, number> | null;
  emotionRawScores?: Record<string, number> | null;
  emotionModel?: string | null;
  emotion?: EmotionInfo | null;
};

export type SpeakerSegment = {
  speaker: string;
  role?: "AGENT" | "CUSTOMER" | "UNKNOWN";
  startMs?: number | null;
  endMs?: number | null;
  text: string;
  emotion?: SegmentEmotion | null;
};

export type PartyInfo = {
  name?: string | null;
  externalId?: string | null;
  phone?: string | null;
};

export type CallDetail = {
  conversationId: string;
  status: string;
  companyId?: number | null;
  agentInfo?: PartyInfo | null;
  customerInfo?: PartyInfo | null;
  isInbound?: boolean | null;
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
  demoCall?: Record<string, unknown> | null;
  videoStats?: Record<string, unknown> | null;
  videoAnalysis?: Record<string, unknown> | null;
  roleMapping?: Record<string, unknown> | null;
  agentTipsHistory?: unknown[] | null;
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

export type QaScoringSettings = {
  companyId: number;
  isConfigured: boolean;
  isEnabled: boolean;
  minScorableCallDurationSeconds: number | null;
  repeatContactAutoPassEnabled: boolean;
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
  status?: string | null;
  isApplicable?: boolean | null;
  score?: number | null;
  earnedPoints?: number | null;
  possiblePoints?: number | null;
  notApplicableReason?: string | null;
  evaluation?: QaEvaluation | null;
};
