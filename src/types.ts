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
  responseLocale: LocaleCode;
};

export type LocaleCode = "en" | "hy" | "ru";

export type UiLocaleOption = {
  code: LocaleCode;
  englishName: string;
  nativeName: string;
  textDirection: "ltr" | "rtl";
};

export type UiLocalizationOptionsResponse = {
  defaultLocale: LocaleCode;
  supportedLocales: UiLocaleOption[];
};

export type CallDataAskRequest = {
  question: string;
  responseLocale: LocaleCode;
  maxCalls?: number;
  useSemanticSearch?: boolean;
  semanticMaxCalls?: number;
  filters?: Record<string, string | number | string[]>;
};

export type CallDataAskResponse = AskResponse;

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
  preferredLocale?: LocaleCode | null;
};

export type CompanySttSettings = {
  companyId: number | string;
  defaultLanguage: string;
  enableAudioEnhancement: boolean;
};

export type CompanySttSettingsUpdate = Pick<
  CompanySttSettings,
  "defaultLanguage" | "enableAudioEnhancement"
>;

export type SttRoutingMetadata = {
  requestedLanguage?: string | null;
  selectedEngine?: string | null;
  fallbackUsed?: boolean | null;
  fallbackReason?: string[] | null;
};

export type DnsmosMetrics = {
  sig?: number | null;
  bak?: number | null;
  ovrl?: number | null;
};

export type SttAudioSampleMetadata = {
  dnsmos?: DnsmosMetrics | null;
};

export type SttSidonMetadata = {
  enabled?: boolean | null;
  attempted?: boolean | null;
  used?: boolean | null;
  device?: string | null;
  processingTimeSec?: number | null;
};

export type SttAudioQualityMetadata = {
  requestedMode?: string | null;
  selectedAudio?: string | null;
  decision?: string | null;
  sidon?: SttSidonMetadata | null;
  raw?: SttAudioSampleMetadata | null;
  enhanced?: SttAudioSampleMetadata | null;
};

export type SttMetadata = {
  routing?: SttRoutingMetadata | null;
  audioQuality?: SttAudioQualityMetadata | null;
};

export type VoiceConnectorFieldType =
  | "text"
  | "password"
  | "url"
  | "number"
  | "boolean"
  | "select";

export type VoiceConnectorReadiness =
  | "available"
  | "experimental"
  | "adapter_required"
  | string;

export type VoiceConnectorFieldDefinition = {
  name: string;
  label: string;
  type: VoiceConnectorFieldType;
  required: boolean;
  secret: boolean;
  description?: string | null;
  default_value?: string | number | boolean | null;
  allowed_values?: Array<string | number> | null;
  placeholder?: string | null;
};

export type VoiceConnectorCatalogItem = {
  provider: string;
  display_name: string;
  readiness: VoiceConnectorReadiness;
  runtime_activation_supported: boolean;
  description?: string | null;
  limitation?: string | null;
  fields: VoiceConnectorFieldDefinition[];
};

export type VoiceConnectorTestStatus =
  | "testing"
  | "connected"
  | "credentials_rejected"
  | "unavailable"
  | "timeout"
  | "adapter_required"
  | string;

export type VoiceConnectorTestResult = {
  status: VoiceConnectorTestStatus;
  message?: string | null;
  tested_at?: string | null;
};

export type VoiceConnectorAccount = {
  provider: string;
  display_name: string;
  enabled: boolean;
  configuration: Record<string, unknown>;
  secret_fields: Record<string, boolean>;
  configuration_version: number;
  last_test?: VoiceConnectorTestResult | null;
  updated_at?: string | null;
};

export type VoiceConnectorUpdate = {
  display_name: string;
  enabled: boolean;
  configuration: Record<string, string | number | boolean>;
  secrets: Record<string, string>;
  clear_secrets: string[];
  expected_version: number;
};

export type VoiceConnectorAuditEvent = {
  id?: string | number | null;
  action: string;
  actor: string;
  occurred_at: string;
  changed_fields: string[];
  trace_id?: string | null;
};

export type AuthTokenResponse = {
  accessToken: string;
  tokenType?: string | null;
  expiresAtUtc?: string | null;
  companyId?: number | string | null;
  companyName?: string | null;
  userRole?: string | null;
  userId?: number | string | null;
  preferredLocale?: LocaleCode | null;
};

export type CompanyTokenResponse = AuthTokenResponse;

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
  preferredLocale: LocaleCode;
};

export type CompanyUserResponse = CompanyUser;

export type CompanyUserInput = {
  name: string;
  email: string;
  role: "Admin" | "User";
  password?: string;
  preferredLocale?: LocaleCode;
};

export type CreateCompanyUserRequest = CompanyUserInput & { password: string };

export type UpdateCompanyUserRequest = Pick<
  CompanyUserInput,
  "name" | "role" | "preferredLocale"
>;

export type CallSummary = {
  conversationId: string;
  conversationName?: string;
  originalAudioFileName?: string;
  status: string;
  source?: string | null;
  modality?: "voice" | "text" | string | null;
  textConnectorAccountId?: string | null;
  sourceProvider?: string | null;
  sourceChannel?: string | null;
  externalSourceConversationId?: string | null;
  textLastMessageAt?: string | null;
  textFinalizedAt?: string | null;
  textFinalizationReason?: string | null;
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
  conversationName?: string;
  originalAudioFileName?: string;
  status: string;
  source?: string | null;
  modality?: "voice" | "text" | string | null;
  textConnectorAccountId?: string | null;
  sourceProvider?: string | null;
  sourceChannel?: string | null;
  externalSourceConversationId?: string | null;
  textLastMessageAt?: string | null;
  textFinalizedAt?: string | null;
  textFinalizationReason?: string | null;
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
  stt?: SttMetadata | null;
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

export type QaScoringMode =
  | "weighted_ratio"
  | "subtract_failed_weights";

export type QaProfile = {
  companyId: number;
  isConfigured: boolean;
  isEnabled: boolean;
  profileName: string;
  qaScoreMaximum: number;
  qaScoringMode: QaScoringMode;
  definition: QaProfileDefinition;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type QaScoringSettings = {
  companyId: number;
  isConfigured: boolean;
  isEnabled: boolean;
  qaScoreMaximum: number;
  qaScoringMode: QaScoringMode;
  minScorableCallDurationSeconds?: number | null;
  repeatContactAutoPassEnabled: boolean;
  updatedAt?: string | null;
};

export type QaScoringSettingsUpdate = {
  qaScoreMaximum: number;
  qaScoringMode: QaScoringMode;
  minScorableCallDurationSeconds: number | null;
  repeatContactAutoPassEnabled: boolean;
};

export type CallUploadResult = {
  conversationId: string;
  conversationDbId?: string | number | null;
  conversationName?: string;
  originalAudioFileName?: string;
  status?: string;
  source?: string | null;
  language?: string | null;
  agentInfo?: PartyInfo | null;
  customerInfo?: PartyInfo | null;
  isInbound?: boolean | null;
  billSeconds?: number | null;
};

// The UI offers the common languages, while the API remains forward-compatible
// with other BCP-47/language codes supported by the backend.
export type CallUploadLanguage = string;

export type CallEnhancementMode = "off" | "auto" | "sidon" | "force-sidon" | string;

export type CallUploadMetadata = {
  agentName?: string;
  agentExternalId?: string;
  agentPhone?: string;
  customerName?: string;
  customerExternalId?: string;
  customerPhone?: string;
  isInbound?: boolean;
  billSeconds?: number;
};

export type CallUploadPayload = {
  conversationId: string;
  url?: string;
  file?: File | null;
  transcript?: string;
  language?: CallUploadLanguage;
  enhancement?: CallEnhancementMode;
  metadata?: CallUploadMetadata;
};

export type StandaloneSttOptions = {
  language?: string;
  enhancement?: CallEnhancementMode;
};

export type StandaloneSttResponse = {
  language?: string | null;
  transcript: string;
  durationSeconds?: number | null;
  segments: SpeakerSegment[];
  routing?: SttRoutingMetadata | null;
  audioQuality?: SttAudioQualityMetadata | null;
};

export type TextConnectorPocCatalogItem = {
  provider: string;
  displayName: string;
  documentationUrl: string;
  messageEvents: string[];
  conversationEvents: string[];
  supportsHistoryApi: boolean;
  historyValidationNote: string;
  securityValidationNote: string;
};

export type TextConnectorAccount = {
  accountId: string;
  provider: string;
  displayName: string;
  idleTimeoutMinutes: number;
  enabled: boolean;
  version: number;
  lastReceivedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  webhookUrl?: string | null;
};

export type CreateTextConnectorAccountInput = {
  provider: string;
  displayName: string;
  idleTimeoutMinutes: number;
  enabled: boolean;
};

export type UpdateTextConnectorAccountInput = {
  displayName: string;
  idleTimeoutMinutes: number;
  enabled: boolean;
  expectedVersion: number;
};

export type TextConnectorWebhookSetup = {
  account: TextConnectorAccount;
  webhookUrl: string;
  webhookKey: string;
};

export type TextConnectorAttachment = Record<string, unknown>;

export type TextConnectorNormalizedEvent = {
  provider: string;
  eventId: string;
  eventType: string;
  providerEventType: string | null;
  externalConversationId: string | null;
  externalMessageId: string | null;
  channelId: string | null;
  channel: string | null;
  direction: string | null;
  senderRole: string | null;
  senderExternalId: string | null;
  senderName: string | null;
  occurredAt: string | null;
  text: string | null;
  attachments: TextConnectorAttachment[];
  requiresHydration: boolean;
  warnings: string[];
};

export type TextConnectorNormalizeResult = {
  normalized: TextConnectorNormalizedEvent;
  sourcePayload: unknown;
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
