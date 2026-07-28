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

export type CallSummaryReportSentiment = {
  sentiment: "positive" | "neutral" | "negative";
  count: number;
  percentage: number;
};

export type QaQuestion = {
  id: string;
  title: string;
  evaluatedCount: number;
  passedCount: number;
  failedCount: number;
  averageScorePercentage: number;
};

export type CallSummaryReportAgent = {
  agentKey: string;
  agentName: string | null;
  agentExternalId: string | null;
  agentPhone: string | null;
  callCount: number;
  qaScoredCallCount: number;
  averageQaScore: number | null;
  weakestQuestion: QaQuestion | null;
  passedQuestions: QaQuestion[];
  notPassedQuestions: QaQuestion[];
};

export type CallSummaryReport = {
  companyId: number;
  createdFromUtc: string;
  createdToUtc: string;
  totalCalls: number;
  totalDurationSeconds: number | null;
  sentiments: CallSummaryReportSentiment[];
  unknownSentimentCount: number;
  averageQaScore: number | null;
  qaScoredCallCount: number;
  agents: CallSummaryReportAgent[];
};

export type AskEvidence = {
  conversationId?: string | null;
  source?: string | null;
  snippet?: string | null;
  timestampMs?: number | null;
  field?: string | null;
};

export type AskResponse = {
  answer: string;
  evidence: AskEvidence[];
  usedCalls?: number | null;
  scope?: string | null;
  semanticSearchUsed?: boolean | null;
};

export type AppSettings = {
  baseUrl: string;
  companyId: string;
  apiToken: string;
  accessToken: string;
  tokenType?: string | null;
  companyName?: string | null;
  expiresAtUtc?: string | null;
  userRole?: string | null;
  userId?: number | string | null;
};

export type AuthTokenResponse = {
  accessToken: string;
  tokenType?: string | null;
  expiresAtUtc?: string | null;
  companyId?: number | string | null;
  companyName?: string | null;
  userRole?: string | null;
  userId?: number | string | null;
};

export type CompanyAgent = {
  id: number;
  name: string;
  externalId?: string | null;
};

export type CompanyUser = {
  id: number;
  name: string;
  email: string;
  role: "Admin" | "User";
  isActive: boolean;
  assignedAgents: CompanyAgent[];
  createdUtc?: string | null;
  lastLoginUtc?: string | null;
};

export type CompanyUserInput = {
  name: string;
  email: string;
  role: "Admin" | "User";
  password?: string;
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
  qaScoreMaximum: number;
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
  isManuallyCorrected?: boolean;
  originalScore?: number | null;
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
  manualCorrection?: {
    originalScore?: number | null;
    reason?: string | null;
    correctedAt?: string | null;
    correctedByUserId?: number | null;
    correctedBy?: string | null;
  } | null;
};

export type QaQuestionCorrection = {
  id: string;
  score: 0 | 1;
  reason: string;
};

export type WorkflowDestinationFilters = {
  sentiments: string[];
  taskUrgencies: string[];
  departments: string[];
  minSatisfactionScore: number | null;
  maxSatisfactionScore: number | null;
  minFriendlinessScore: number | null;
  maxFriendlinessScore: number | null;
  minQaScore: number | null;
  maxQaScore: number | null;
  qaApplicable: boolean | null;
  isInbound: boolean | null;
};

export type WebhookPayloadOptions = {
  includeTranscript: boolean;
  includeRedactedTranscript: boolean;
  includeAnalysisJson: boolean;
  includeDiarization: boolean;
  includeQaEvaluationJson: boolean;
  customFields: Record<string, string>;
};

export type JiraIssueOptions = {
  projectKey: string;
  issueType: string;
  summary: string | null;
  priorityName: string | null;
  assigneeAccountId: string | null;
  labels: string[];
  includeAnalysisSummaryInDescription: boolean;
  includeTranscriptInDescription: boolean;
  additionalFields: Record<string, string>;
};

export type Bitrix24LeadOptions = {
  title: string | null;
  sourceId: string | null;
  statusId: string | null;
  assignedById: number | null;
  opened: boolean | null;
  includeAnalysisSummaryInComments: boolean;
  additionalFields: Record<string, string>;
};

export type WorkflowDestinationPayloadOptions = Partial<WebhookPayloadOptions> & {
  jiraIssue?: JiraIssueOptions;
  bitrix24Lead?: Bitrix24LeadOptions;
};

export type WorkflowPlatform =
  | "Zapier"
  | "Make"
  | "n8n"
  | "Pipedream"
  | "Power Automate"
  | "Custom Webhook"
  | "jira"
  | "bitrix24";

export type WorkflowDestination = {
  id: string;
  name: string;
  platform: WorkflowPlatform;
  eventType: string;
  isEnabled: boolean;
  webhookUrl: string;
  headers: Record<string, string>;
  filters: WorkflowDestinationFilters;
  payloadOptions: WorkflowDestinationPayloadOptions;
  metadata: Record<string, string>;
  createdAt?: string | null;
  updatedAt?: string | null;
  raw: unknown;
};

export type WorkflowDestinationInput = Omit<
  WorkflowDestination,
  "id" | "createdAt" | "updatedAt" | "raw"
>;

export type WorkflowDelivery = {
  id: string;
  createdAt?: string | null;
  deliveredAt?: string | null;
  status: string;
  attemptCount: number | null;
  responseStatusCode: number | null;
  error?: string | null;
  responseBody?: string | null;
  raw: unknown;
};

export type WorkflowTestResult = {
  ok: boolean;
  deliveryStatus?: string | null;
  status: number;
  responseStatusCode?: number | null;
  responseBody?: string | null;
  error?: string | null;
  raw?: unknown;
};
